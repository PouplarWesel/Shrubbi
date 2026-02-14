#!/usr/bin/env node
/*
  Generates a migration that:
  - adds public.cities.boundary_geojson (jsonb)
  - backfills boundary polygons for our cities (California) from Cal-Adapt places
  - updates public.city_map_stats to include boundary_geojson

  Data source:
  - Cal-Adapt API (places) in EPSG:3857, converted to lon/lat (EPSG:4326)

  Optional env:
  - CITIES_PATH (defaults to tmp_cities.json)
  - MIGRATION_PATH (defaults to supabase/migrations/20260216000000_add_city_boundaries.sql)
*/

import fs from "node:fs";

const DEFAULT_CITIES_PATH = "tmp_cities.json";
const DEFAULT_MIGRATION_PATH =
  "supabase/migrations/20260216000000_add_city_boundaries.sql";

const CAL_ADAPT_SEARCH_URL = "https://api.cal-adapt.org/api/place/";

const CITY_NAME_ALIASES = {
  // Census place name (what Cal-Adapt uses) differs from common usage in our DB.
  Ventura: "San Buenaventura (Ventura)",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sqlEscapeText(input) {
  return String(input ?? "").replace(/'/g, "''");
}

function mercatorToLngLat([x, y]) {
  const R = 6378137;
  const lng = (Number(x) / R) * (180 / Math.PI);
  const lat =
    (2 * Math.atan(Math.exp(Number(y) / R)) - Math.PI / 2) * (180 / Math.PI);
  return [lng, lat];
}

function round6(n) {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 1e6) / 1e6;
}

function convertCoordinates(coords) {
  if (!Array.isArray(coords)) return coords;
  if (
    coords.length === 2 &&
    typeof coords[0] === "number" &&
    typeof coords[1] === "number"
  ) {
    const [lng, lat] = mercatorToLngLat(coords);
    return [round6(lng), round6(lat)];
  }
  return coords.map(convertCoordinates);
}

async function fetchJsonWithRetry(url, { retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/geo+json,application/json,*/*" },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} ${body}`.trim());
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      const delay = 400 * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function fetchPlaceBoundaryGeometryByName(name) {
  const url = new URL(CAL_ADAPT_SEARCH_URL);
  url.searchParams.set("format", "geojson");
  url.searchParams.set("search", name);
  url.searchParams.set("limit", "50");

  const data = await fetchJsonWithRetry(url.toString());
  const features = Array.isArray(data?.features) ? data.features : [];

  const match =
    features.find(
      (f) =>
        String(f?.properties?.name ?? "")
          .trim()
          .toLowerCase() === String(name).trim().toLowerCase(),
    ) ?? null;

  if (!match?.geometry || typeof match.geometry !== "object") return null;
  const type = match.geometry.type;
  if (type !== "Polygon" && type !== "MultiPolygon") return null;
  if (!Array.isArray(match.geometry.coordinates)) return null;

  return {
    type,
    coordinates: convertCoordinates(match.geometry.coordinates),
  };
}

function cityMapStatsViewSql() {
  // Keep this in sync with sql/city_map_stats.sql and the applied migration.
  // Include boundary_geojson so the app can render true city polygons.
  return `
create or replace view public.city_map_stats as
with city_members as (
  select
    p.city_id,
    count(distinct p.id) as member_count
  from public.profiles as p
  where p.city_id is not null
  group by p.city_id
),
city_plants as (
  select
    p.city_id,
    coalesce(sum(up.quantity), 0)::bigint as total_plants,
    (
      coalesce(
        sum(
          (
            (
              coalesce(up.co2_kg_per_year_override, pl.default_co2_kg_per_year, 0::numeric)
              * (greatest((current_date - up.planted_on), 0))::numeric
            )
            / 365.0
          )
          * (up.quantity)::numeric
        ),
        0::numeric
      )
    )::numeric(14,4) as total_co2_removed_kg
  from public.user_plants as up
  join public.profiles as p on p.id = up.user_id
  left join public.plants as pl on pl.id = up.plant_id
  where p.city_id is not null
  group by p.city_id
),
city_type_counts as (
  select
    p.city_id,
    pl.type as plant_type,
    sum(up.quantity)::bigint as plant_count
  from public.user_plants as up
  join public.profiles as p on p.id = up.user_id
  join public.plants as pl on pl.id = up.plant_id
  where p.city_id is not null
  group by p.city_id, pl.type
),
city_type_agg as (
  select
    city_id,
    jsonb_object_agg(plant_type, plant_count order by plant_count desc) as type_breakdown,
    (array_agg(plant_type order by plant_count desc))[1] as best_plant_type,
    (array_agg(plant_count order by plant_count desc))[1] as best_plant_type_count
  from city_type_counts
  group by city_id
)
select
  c.id as city_id,
  c.name as city_name,
  c.state as city_state,
  c.country as city_country,
  c.country_code,
  c.center_lat,
  c.center_lon,
  c.bbox_sw_lat,
  c.bbox_sw_lon,
  c.bbox_ne_lat,
  c.bbox_ne_lon,
  c.boundary_geojson,
  coalesce(cm.member_count, 0)::bigint as member_count,
  coalesce(cp.total_plants, 0)::bigint as total_plants,
  coalesce(cp.total_co2_removed_kg, 0::numeric)::numeric(14,4) as total_co2_removed_kg,
  cta.best_plant_type,
  cta.best_plant_type_count,
  coalesce(cta.type_breakdown, '{}'::jsonb) as type_breakdown
from public.cities as c
left join city_members as cm on cm.city_id = c.id
left join city_plants as cp on cp.city_id = c.id
left join city_type_agg as cta on cta.city_id = c.id;

alter view public.city_map_stats set (security_invoker = false);
alter view public.city_map_stats owner to postgres;

grant select on public.city_map_stats to authenticated;
grant all on public.city_map_stats to service_role;

notify pgrst, 'reload schema';
`.trim();
}

async function main() {
  const citiesPath = process.env.CITIES_PATH ?? DEFAULT_CITIES_PATH;
  const migrationPath = process.env.MIGRATION_PATH ?? DEFAULT_MIGRATION_PATH;

  if (!fs.existsSync(citiesPath)) {
    throw new Error(`Cities file not found: ${citiesPath}`);
  }

  const citiesRaw = JSON.parse(fs.readFileSync(citiesPath, "utf8"));
  const cities = Array.isArray(citiesRaw) ? citiesRaw : [];

  const targets = cities.filter(
    (c) =>
      String(c?.country_code ?? "").toUpperCase() === "US" &&
      String(c?.state ?? "").toLowerCase() === "california" &&
      typeof c?.name === "string" &&
      c.name.trim() !== "",
  );

  if (!targets.length) {
    throw new Error("No target cities found in tmp_cities.json");
  }

  const updates = [];
  const missing = [];

  for (const city of targets) {
    const name = city.name.trim();
    const lookupName = CITY_NAME_ALIASES[name] ?? name;
    // Light throttling to be polite to the API.
    await sleep(125);
    const geom = await fetchPlaceBoundaryGeometryByName(lookupName);
    if (!geom) {
      missing.push(name);
      continue;
    }

    const json = JSON.stringify(geom);
    updates.push(
      `update public.cities set boundary_geojson = $geojson$${json}$geojson$::jsonb\n` +
        `where lower(name) = lower('${sqlEscapeText(name)}')\n` +
        `  and lower(coalesce(state, '')) = lower('California')\n` +
        `  and upper(country_code) = upper('US');`,
    );
  }

  const header =
    `-- Adds real city boundary polygons for Mapbox overlays.\n` +
    `-- Source: Cal-Adapt places (EPSG:3857), converted to WGS84 lon/lat.\n`;

  const sql =
    header +
    `\n` +
    `alter table public.cities\n` +
    `  add column if not exists boundary_geojson jsonb;\n` +
    `\n` +
    `-- Backfill boundaries for CA cities.\n` +
    updates.join("\n\n") +
    `\n\n` +
    `-- Ensure the map view includes the boundary geometry.\n` +
    cityMapStatsViewSql() +
    `\n`;

  fs.mkdirSync("supabase/migrations", { recursive: true });
  fs.writeFileSync(migrationPath, sql, "utf8");

  console.log(`Wrote migration: ${migrationPath}`);

  console.log(`Boundaries: ${updates.length}/${targets.length} cities matched`);
  if (missing.length) {
    console.warn(`Missing boundaries for: ${missing.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
