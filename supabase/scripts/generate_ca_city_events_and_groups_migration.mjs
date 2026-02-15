#!/usr/bin/env node
/*
  Generates a migration that seeds:
  - Region + school "groups" per city (stored as public.teams)
  - City events for every city except San Francisco (public.events)
  - Seed user signups for upcoming seeded events (public.event_attendees)

  Data sources:
  - Supabase REST (cities)
  - OpenStreetMap Overpass API (named parks + schools per city)

  Required env:
  - SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE)

  Optional env:
  - SUPABASE_URL (defaults to .env EXPO_PUBLIC_SUPABASE_URL)
  - MIGRATION_PATH (defaults to supabase/migrations/20260214210000_seed_ca_city_events_groups.sql)
*/

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const SF_CITY_ID = "f4307411-bc1f-441e-b3f1-64f412605bf0";
const DEFAULT_MIGRATION_PATH =
  "supabase/migrations/20260214220000_seed_ca_city_events_groups.sql";

function readDotEnv(filepath) {
  try {
    const raw = fs.readFileSync(filepath, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim();
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asciiSanitize(input) {
  if (input == null) return "";
  const s = String(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x00-\x7F]/g, "")
    .trim();
  return s;
}

function sqlEscapeText(input) {
  const s = asciiSanitize(input);
  return s.replace(/'/g, "''");
}

function sqlValue(value) {
  if (value == null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null";
    return String(value);
  }
  return `'${sqlEscapeText(value)}'`;
}

function uuidFromMd5(seed) {
  const hex = crypto.createHash("md5").update(seed).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function addDays(dateUtc, days) {
  return new Date(dateUtc.getTime() + days * 24 * 60 * 60 * 1000);
}

function fmtDate(dateUtc) {
  const y = dateUtc.getUTCFullYear();
  const m = String(dateUtc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateUtc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function makeLocalTs(dateUtc, hhmm) {
  return `${fmtDate(dateUtc)} ${hhmm}`;
}

function overpassEscape(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function fetchCities({ supabaseUrl, serviceRoleKey }) {
  const url = `${supabaseUrl}/rest/v1/cities?select=id,name,state,country,country_code&order=name.asc`;
  const cities = await fetchJson(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  return cities;
}

async function fetchCityVenuesOverpass(cityName) {
  const outLimit = Math.max(
    50,
    Math.min(Number(process.env.OVERPASS_OUT_LIMIT || "140"), 400)
  );

  const query = `
[out:json][timeout:25];
area["name"="California"]["boundary"="administrative"]["admin_level"="4"]->.ca;
relation["boundary"="administrative"]["admin_level"="8"]["name"="${overpassEscape(
    cityName
  )}"](area.ca);
map_to_area->.a;
(
  node["leisure"="park"]["name"](area.a);
  way["leisure"="park"]["name"](area.a);
  relation["leisure"="park"]["name"](area.a);

  node["amenity"~"school|college|university"]["name"](area.a);
  way["amenity"~"school|college|university"]["name"](area.a);
  relation["amenity"~"school|college|university"]["name"](area.a);
);
out tags center ${outLimit};
`.trim();

  const body = new URLSearchParams({ data: query });
  const endpoints = [
    process.env.OVERPASS_ENDPOINT,
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
  ].filter(Boolean);

  // Try endpoints in order. If one rate-limits or errors, we'll fall back.
  let lastErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ShrubbiSeed/1.0 (migration-generator)",
      },
      body,
    });

    if (res.status === 429) {
      lastErr = new Error(
        "Overpass rate limited (429)."
      );
      // Try the next endpoint (don't block for a full minute).
      await sleep(800);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      lastErr = new Error(`Overpass HTTP ${res.status}: ${text.slice(0, 500)}`);
      // Try next endpoint.
      await sleep(2000);
      continue;
    }

    return res.json();
  }

  throw lastErr || new Error("Overpass request failed");
}

function pickVenues({ cityName, elements }) {
  const parks = [];
  const schools = [];

  for (const el of elements || []) {
    const name = asciiSanitize(el.tags?.name);
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;

    if (el.tags?.leisure === "park") {
      parks.push({ name, lat, lon });
    }

    const amenity = el.tags?.amenity;
    if (amenity === "school" || amenity === "college" || amenity === "university") {
      schools.push({ name, lat, lon, amenity });
    }
  }

  const uniqByName = (arr) => {
    const seen = new Set();
    const out = [];
    for (const item of arr) {
      const k = item.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
    return out;
  };

  const parkSorted = uniqByName(parks).sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  );

  const schoolFiltered = uniqByName(schools)
    .filter((s) => !/school district/i.test(s.name))
    .sort((a, b) => {
      const rank = (x) => (x.amenity === "school" ? 0 : x.amenity === "college" ? 1 : 2);
      const r = rank(a) - rank(b);
      return r !== 0
        ? r
        : a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });

  const chosenParks = parkSorted.slice(0, 3);
  while (chosenParks.length < 3) {
    chosenParks.push({
      name: `${cityName} Community Park`,
      lat: null,
      lon: null,
    });
  }

  const school =
    schoolFiltered[0] ?? ({
      name: `${cityName} High School`,
      lat: null,
      lon: null,
      amenity: "school",
    });

  return { parks: chosenParks, school };
}

function buildEventTemplates() {
  // 16 events per city, spread over ~6 weeks.
  return [
    {
      idx: 1,
      place: "park1",
      title: (p) => `${p.park1} Morning Cleanup`,
      activity_type: "park_cleanup",
      description:
        "Trash grab + recycling sort with a short neighborhood walk loop. Gloves and bags provided.",
      dayOffset: 0,
      start: "09:00",
      end: "11:30",
      deadlineRelDays: -1,
      deadline: "20:00",
      max: 60,
      notes: "Meet near the main entrance and look for the Shrubbi check-in sign.",
    },
    {
      idx: 2,
      place: "park1",
      title: (p) => `${p.park1} Picnic + Litter Pick`,
      activity_type: "picnic",
      description:
        "Bring lunch, meet neighbors, and help leave the park cleaner than we found it.",
      dayOffset: 0,
      start: "11:00",
      end: "14:00",
      deadlineRelDays: 0,
      deadline: "09:00",
      max: 90,
      notes: "Bring a blanket. Quick cleanup loop starts after lunch.",
    },
    {
      idx: 3,
      place: "park2",
      title: (p) => `${p.park2} Trail Cleanup`,
      activity_type: "trail_cleanup",
      description:
        "Trail-edge litter pickup with safety briefing and small-team route assignments.",
      dayOffset: 1,
      start: "09:00",
      end: "12:00",
      deadlineRelDays: -1,
      deadline: "20:00",
      max: 55,
      notes: "Wear closed-toe shoes. We will split into small trail teams.",
    },
    {
      idx: 4,
      place: "park3",
      title: (p) => `${p.park3} Habitat Restoration Day`,
      activity_type: "habitat_restoration",
      description:
        "Light weeding, mulch refresh, and habitat-friendly cleanup with local volunteers.",
      dayOffset: 1,
      start: "09:30",
      end: "12:00",
      deadlineRelDays: -1,
      deadline: "20:00",
      max: 45,
      notes: "Meet at the trailhead area for tools and a short briefing.",
    },
    {
      idx: 5,
      place: "park2",
      title: (p) => `${p.park2} Sunset Sweep`,
      activity_type: "park_cleanup",
      description:
        "Quick after-work cleanup focused on high-traffic paths and seating areas.",
      dayOffset: 4,
      start: "17:30",
      end: "19:00",
      deadlineRelDays: 0,
      deadline: "16:00",
      max: 45,
      notes: "Bring a headlamp if you have one. We will wrap before dark.",
    },
    {
      idx: 6,
      place: "park3",
      title: (p) => `${p.park3} After-Work Park Cleanup`,
      activity_type: "park_cleanup",
      description:
        "Short weekday cleanup loop for paths, picnic tables, and curb edges near the park.",
      dayOffset: 5,
      start: "17:30",
      end: "19:00",
      deadlineRelDays: 0,
      deadline: "16:00",
      max: 45,
      notes: "Meet by the most visible entrance. Look for the Shrubbi sign.",
    },
    {
      idx: 7,
      place: "park1",
      title: (p) => `${p.park1} Native Planting Morning`,
      activity_type: "native_planting",
      description:
        "Native planting and small-area stewardship to support pollinators and healthy soils.",
      dayOffset: 7,
      start: "09:00",
      end: "11:30",
      deadlineRelDays: -1,
      deadline: "20:00",
      max: 40,
      notes: "Wear clothes you can get dirty. Tools will be provided on site.",
    },
    {
      idx: 8,
      place: "park2",
      title: (p) => `${p.park2} Tree Care Day`,
      activity_type: "habitat_restoration",
      description:
        "Mulch ring refresh, light watering, and cleanup around young trees and shrubs.",
      dayOffset: 8,
      start: "09:00",
      end: "11:30",
      deadlineRelDays: -1,
      deadline: "20:00",
      max: 40,
      notes: "Meet at the main path junction for assignments.",
    },
    {
      idx: 9,
      place: "park3",
      title: (p) => `${p.park3} Community Picnic`,
      activity_type: "picnic",
      description:
        "Weekend picnic with a leave-no-trace cleanup pass before we wrap up.",
      dayOffset: 14,
      start: "11:00",
      end: "14:00",
      deadlineRelDays: 0,
      deadline: "09:00",
      max: 90,
      notes: "Optional: bring extra bags to help with sorting and recycling.",
    },
    {
      idx: 10,
      place: "school",
      title: (p) => `${p.school} Campus Cleanup`,
      activity_type: "park_cleanup",
      description:
        "Community campus-edge cleanup focused on sidewalks, planters, and nearby blocks.",
      dayOffset: 10,
      start: "16:00",
      end: "18:00",
      deadlineRelDays: 0,
      deadline: "12:00",
      max: 80,
      notes: "Meet near the main entrance gate/office for check-in.",
    },
    {
      idx: 11,
      place: "school",
      title: (p) => `${p.school} Green Club Meetup`,
      activity_type: "community",
      description:
        "Planning meetup for upcoming cleanups and school garden stewardship. All ages welcome.",
      dayOffset: 12,
      start: "18:00",
      end: "19:30",
      deadlineRelDays: 0,
      deadline: "15:00",
      max: 120,
      notes: "Bring ideas for projects. We will keep it friendly and quick.",
    },
    {
      idx: 12,
      place: "school",
      title: (p) => `${p.school} School Garden Planting`,
      activity_type: "native_planting",
      description:
        "Help refresh a school garden area with planting, mulching, and cleanup.",
      dayOffset: 21,
      start: "10:00",
      end: "12:00",
      deadlineRelDays: -1,
      deadline: "20:00",
      max: 60,
      notes: "Wear sun protection. Light tools and gloves recommended.",
    },
    {
      idx: 13,
      place: "park1",
      title: (p) => `${p.park1} Weekend Cleanup Loop`,
      activity_type: "park_cleanup",
      description:
        "Weekly cleanup loop around the park perimeter and nearby streets.",
      dayOffset: 28,
      start: "09:00",
      end: "11:00",
      deadlineRelDays: -1,
      deadline: "20:00",
      max: 70,
      notes: "Meet at the most visible entrance for supplies and route assignments.",
    },
    {
      idx: 14,
      place: "park2",
      title: (p) => `${p.park2} Trail Stewardship`,
      activity_type: "trail_cleanup",
      description:
        "Trail maintenance lite: trash pickup, brush clearing, and path-edge attention.",
      dayOffset: 29,
      start: "09:00",
      end: "12:00",
      deadlineRelDays: -1,
      deadline: "20:00",
      max: 55,
      notes: "Bring water. Closed-toe shoes required.",
    },
    {
      idx: 15,
      place: "park3",
      title: (p) => `${p.park3} Habitat + Cleanup Morning`,
      activity_type: "habitat_restoration",
      description:
        "Habitat-friendly cleanup with light invasive pull and litter removal.",
      dayOffset: 35,
      start: "09:00",
      end: "11:30",
      deadlineRelDays: -1,
      deadline: "20:00",
      max: 50,
      notes: "Meet at the trailhead/parking area for a short safety briefing.",
    },
    {
      idx: 16,
      place: "school",
      title: (p) => `${p.school} Recycling Drive + Cleanup`,
      activity_type: "community",
      description:
        "Bring recyclable items and help with a short community cleanup around drop-off points.",
      dayOffset: 38,
      start: "15:30",
      end: "17:00",
      deadlineRelDays: 0,
      deadline: "12:00",
      max: 120,
      notes: "We will share accepted items list in the event notes and updates.",
    },
  ];
}

function generateEventsForCity({ seedTag, city, venues, cityIndex }) {
  const baseSaturday = new Date(Date.UTC(2026, 2, 7)); // 2026-03-07
  const startWeekDate = addDays(baseSaturday, (cityIndex % 6) * 7);

  const p = {
    city: city.name,
    park1: venues.parks[0].name,
    park2: venues.parks[1].name,
    park3: venues.parks[2].name,
    school: venues.school.name,
  };

  const locByKey = {
    park1: venues.parks[0],
    park2: venues.parks[1],
    park3: venues.parks[2],
    school: venues.school,
  };

  const templates = buildEventTemplates();
  const events = [];

  for (const t of templates) {
    const loc = locByKey[t.place];
    const eventDate = addDays(startWeekDate, t.dayOffset);
    const starts_local = makeLocalTs(eventDate, t.start);
    const ends_local = makeLocalTs(eventDate, t.end);
    const deadlineDate = addDays(eventDate, t.deadlineRelDays);
    const sign_up_deadline_local = makeLocalTs(deadlineDate, t.deadline);

    events.push({
      id: uuidFromMd5(`${seedTag}:event:${city.id}:${t.idx}`),
      city_id: city.id,
      place_kind: t.place,
      title: t.title(p),
      activity_type: t.activity_type,
      description: t.description,
      location_name: loc?.name ?? city.name,
      location_address: `${city.name}, California`,
      location_notes: t.notes,
      latitude: loc?.lat ?? null,
      longitude: loc?.lon ?? null,
      starts_local,
      ends_local,
      sign_up_deadline_local,
      max_attendees: t.max,
    });
  }

  return events;
}

function buildMigrationSql({ seedTag, cities, cityVenues, events }) {
  const citySchoolsValues = cities
    .map((c) => {
      const schoolName = cityVenues.get(c.id)?.school?.name ?? `${c.name} High School`;
      return `    (${sqlValue(c.id)}::uuid, ${sqlValue(schoolName)})`;
    })
    .join(",\n");

  const eventsValues = events
    .map((e) => {
      return [
        "    (",
        `${sqlValue(e.id)}::uuid,`,
        `${sqlValue(e.city_id)}::uuid,`,
        `${sqlValue(e.place_kind)},`,
        `${sqlValue(e.title)},`,
        `${sqlValue(e.activity_type)},`,
        `${sqlValue(e.description)},`,
        `${sqlValue(e.location_name)},`,
        `${sqlValue(e.location_address)},`,
        `${sqlValue(e.location_notes)},`,
        `${sqlValue(e.latitude)},`,
        `${sqlValue(e.longitude)},`,
        `${sqlValue(e.starts_local)},`,
        `${sqlValue(e.ends_local)},`,
        `${sqlValue(e.sign_up_deadline_local)},`,
        `${sqlValue(e.max_attendees)}`,
        "    )",
      ].join(" ");
    })
    .join(",\n");

  return `do $$
declare
  v_seed_tag constant text := '${sqlEscapeText(seedTag)}';
  v_sf_city_id constant uuid := '${SF_CITY_ID}';
begin
  create temporary table tmp_city_creators on commit drop as
  select distinct on (p.city_id)
    p.city_id,
    p.id as creator_id
  from public.profiles as p
  where p.city_id is not null
  order by p.city_id, p.created_at asc, p.id;

  -- Region groups per city (stored as teams).
  insert into public.teams (city_id, name, description, created_by)
  select
    c.id,
    c.name || ' ' || rd.suffix,
    rd.description,
    cc.creator_id
  from public.cities as c
  join tmp_city_creators as cc
    on cc.city_id = c.id
  join (
    values
      ('Downtown Neighbors', 'City-center group for quick after-work cleanups and meetups.'),
      ('Northside Crew', 'Northside volunteers coordinating parks and trail stewardship.'),
      ('Eastside Stewards', 'Eastside neighbors focused on litter picks and native planting.'),
      ('Westside Walkers', 'Westside walk-and-clean group for streets and greenways.')
  ) as rd(suffix, description)
    on true
  on conflict do nothing;

  -- School group per city (stored as teams).
  with seed_city_schools(city_id, school_name) as (
    values
${citySchoolsValues}
  )
  insert into public.teams (city_id, name, description, created_by)
  select
    sc.city_id,
    sc.school_name || ' Green Club',
    'School-based group for ' || sc.school_name || ' (students + neighbors).',
    cc.creator_id
  from seed_city_schools as sc
  join tmp_city_creators as cc
    on cc.city_id = sc.city_id
  on conflict do nothing;

  -- Join seed users to exactly one region group.
  with seed_users as (
    select p.id as user_id, p.city_id
    from public.profiles as p
    where p.city_id is not null
      and p.email like '%@seed.shrubbi.app'
  ),
  region_defs as (
    values
      (0, 'Downtown Neighbors'),
      (1, 'Northside Crew'),
      (2, 'Eastside Stewards'),
      (3, 'Westside Walkers')
  ),
  user_regions as (
    select
      su.user_id,
      su.city_id,
      (get_byte(decode(md5(su.user_id::text || ':region'), 'hex'), 0) % 4)::int as region_idx
    from seed_users as su
  )
  insert into public.team_memberships (user_id, team_id, role)
  select
    ur.user_id,
    t.id,
    'member'
  from user_regions as ur
  join public.cities as c
    on c.id = ur.city_id
  join region_defs as rd(region_idx, suffix)
    on rd.region_idx = ur.region_idx
  join public.teams as t
    on t.city_id = ur.city_id
   and lower(t.name) = lower(c.name || ' ' || rd.suffix)
  on conflict (user_id, team_id) do nothing;

  -- Join ~35% of seed users to their city school group.
  with seed_users as (
    select p.id as user_id, p.city_id
    from public.profiles as p
    where p.city_id is not null
      and p.email like '%@seed.shrubbi.app'
  ),
  seed_city_schools(city_id, school_name) as (
    values
${citySchoolsValues}
  )
  insert into public.team_memberships (user_id, team_id, role)
  select
    su.user_id,
    t.id,
    'member'
  from seed_users as su
  join seed_city_schools as sc
    on sc.city_id = su.city_id
  join public.teams as t
    on t.city_id = sc.city_id
   and lower(t.name) = lower(sc.school_name || ' Green Club')
  where (get_byte(decode(md5(su.user_id::text || ':school'), 'hex'), 0) % 100) < 35
  on conflict (user_id, team_id) do nothing;

  -- Seed city events for all cities except San Francisco (SF already has a seed batch).
  with seed_events as (
    select *
    from (
      values
${eventsValues}
    ) as s(
      id,
      city_id,
      place_kind,
      title,
      activity_type,
      description,
      location_name,
      location_address,
      location_notes,
      latitude,
      longitude,
      starts_local,
      ends_local,
      sign_up_deadline_local,
      max_attendees
    )
  )
  insert into public.events (
    id,
    city_id,
    created_by,
    title,
    description,
    activity_type,
    location_name,
    location_address,
    location_notes,
    latitude,
    longitude,
    starts_at,
    ends_at,
    sign_up_deadline,
    max_attendees,
    metadata
  )
  select
    se.id,
    se.city_id,
    cc.creator_id,
    se.title,
    se.description,
    se.activity_type,
    se.location_name,
    se.location_address,
    se.location_notes,
    se.latitude,
    se.longitude,
    se.starts_local::timestamp at time zone 'America/Los_Angeles',
    se.ends_local::timestamp at time zone 'America/Los_Angeles',
    se.sign_up_deadline_local::timestamp at time zone 'America/Los_Angeles',
    se.max_attendees,
    jsonb_build_object(
      'seed_batch',
      'ca_city_events_2026_spring',
      'seed_source',
      'codex_seed',
      'seed_tag',
      v_seed_tag,
      'place_kind',
      se.place_kind
    )
  from seed_events as se
  join tmp_city_creators as cc
    on cc.city_id = se.city_id
  where se.city_id <> v_sf_city_id
  on conflict (id) do nothing;

  -- Sign up seed users to 3 upcoming seeded events in their city.
  create temporary table tmp_eligible_events on commit drop as
  select
    e.id as event_id,
    e.city_id,
    row_number() over (partition by e.city_id order by e.starts_at asc, e.id)::int as event_rn,
    count(*) over (partition by e.city_id)::int as event_count
  from public.events as e
  where e.is_cancelled = false
    and e.metadata ->> 'seed_source' = 'codex_seed'
    and e.starts_at > timezone('utc', now()) + interval '2 days'
    and (e.sign_up_deadline is null or e.sign_up_deadline > timezone('utc', now()));

  with seed_users as (
    select p.id as user_id, p.city_id
    from public.profiles as p
    where p.city_id is not null
      and p.email like '%@seed.shrubbi.app'
  ),
  user_slots as (
    select su.user_id, su.city_id, gs.slot
    from seed_users as su
    join lateral generate_series(1, 3) as gs(slot)
      on true
  ),
  city_event_counts as (
    select distinct city_id, event_count
    from tmp_eligible_events
    where event_count > 0
  ),
  picks as (
    select
      us.user_id,
      us.city_id,
      (
        1
        + (
          get_byte(
            decode(md5(us.user_id::text || ':' || us.slot::text || ':event_pick'), 'hex'),
            0
          )
          % cec.event_count
        )
      )::int as pick_rn
    from user_slots as us
    join city_event_counts as cec
      on cec.city_id = us.city_id
  )
  insert into public.event_attendees (
    event_id,
    user_id,
    status
  )
  select
    te.event_id,
    p.user_id,
    'going'::public.event_attendance_status
  from picks as p
  join tmp_eligible_events as te
    on te.city_id = p.city_id
   and te.event_rn = p.pick_rn
  on conflict (event_id, user_id) do nothing;

  raise notice 'Seeded CA city groups + events (seed tag: %)', v_seed_tag;
end
$$;
`;
}

async function main() {
  const dotEnv = readDotEnv(".env");
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    dotEnv.EXPO_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL in .env)");
  }

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE)");
  }

  const migrationPath = process.env.MIGRATION_PATH || DEFAULT_MIGRATION_PATH;
  const seedTag = "ca_city_events_groups_20260214";

  const cities = await fetchCities({ supabaseUrl, serviceRoleKey });

  const cityVenues = new Map();
  const cachePath = "tmp_city_venues.json";
  const fallbackCities = [];
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      for (const [cityId, venues] of Object.entries(cached)) {
        cityVenues.set(cityId, venues);
      }
    } catch {
      // ignore cache parse failures
    }
  }

  const fallbackVenuesForCity = (cityName) => ({
    parks: [
      { name: `${cityName} Central Park`, lat: null, lon: null },
      { name: `${cityName} Community Park`, lat: null, lon: null },
      { name: `${cityName} Regional Park`, lat: null, lon: null },
    ],
    school: { name: `${cityName} High School`, lat: null, lon: null, amenity: "school" },
  });

  for (const city of cities) {
    if (cityVenues.has(city.id)) continue;

    let attempts = 0;
    for (;;) {
      attempts += 1;
      try {
        const data = await fetchCityVenuesOverpass(city.name);
        const venues = pickVenues({ cityName: city.name, elements: data.elements });
        cityVenues.set(city.id, venues);
        const out = Object.fromEntries(cityVenues.entries());
        fs.writeFileSync(cachePath, JSON.stringify(out, null, 2));
        break;
      } catch (e) {
        if (attempts >= 4) {
          const venues = fallbackVenuesForCity(city.name);
          cityVenues.set(city.id, venues);
          const out = Object.fromEntries(cityVenues.entries());
          fs.writeFileSync(cachePath, JSON.stringify(out, null, 2));
          fallbackCities.push(city.name);
          break;
        }
        await sleep(1800 * attempts);
      }
    }

    // Gentle pacing for Overpass.
    await sleep(2200);
  }

  const events = [];
  let idx = 0;
  for (const city of cities) {
    idx += 1;
    if (city.id === SF_CITY_ID) continue; // SF already has its own seed batch
    const venues = cityVenues.get(city.id);
    events.push(
      ...generateEventsForCity({
        seedTag,
        city,
        venues,
        cityIndex: idx,
      })
    );
  }

  const sql = buildMigrationSql({ seedTag, cities, cityVenues, events });
  fs.mkdirSync(path.dirname(migrationPath), { recursive: true });
  fs.writeFileSync(migrationPath, sql, "utf8");
  console.log(`Wrote migration: ${migrationPath}`);
  console.log(`Cities: ${cities.length} (events seeded for ${cities.length - 1} excluding SF)`);
  console.log(`Events: ${events.length}`);
  console.log(`Venue cache: ${cachePath}`);
  if (fallbackCities.length) {
    console.log(`Fallback venues used for ${fallbackCities.length} cities: ${fallbackCities.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
