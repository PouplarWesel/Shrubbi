do $$
declare
  v_city_id constant uuid := 'f4307411-bc1f-441e-b3f1-64f412605bf0';
  v_seed_batch constant text := 'sf_city_events_2026_02';
  v_seed_source constant text := 'codex_seed';
  v_excluded_creator_id uuid;
  v_creator_count integer := 0;
  v_event_count integer := 0;
  v_updated_count integer := 0;
begin
  -- Exclude the original seeding creator (so these look like they were made by "other users").
  select e.created_by
  into v_excluded_creator_id
  from public.events as e
  where e.city_id = v_city_id
    and e.metadata ->> 'seed_batch' = v_seed_batch
    and e.metadata ->> 'seed_source' = v_seed_source
  order by e.created_at asc
  limit 1;

  create temporary table tmp_sf_event_creators (
    user_id uuid not null,
    user_rn integer not null
  ) on commit drop;

  -- Prefer seed users (created in 20260214203000_seed_bulk_users_teams_plants.sql).
  insert into tmp_sf_event_creators (user_id, user_rn)
  select
    p.id,
    row_number() over (order by p.id)::int
  from public.profiles as p
  where p.city_id = v_city_id
    and p.email like '%@seed.shrubbi.app'
    and (v_excluded_creator_id is null or p.id <> v_excluded_creator_id);

  get diagnostics v_creator_count = row_count;

  -- Fallback to any SF profile if there are no seed users (e.g. on older DBs).
  if v_creator_count = 0 then
    insert into tmp_sf_event_creators (user_id, user_rn)
    select
      p.id,
      row_number() over (order by p.id)::int
    from public.profiles as p
    where p.city_id = v_city_id
      and (v_excluded_creator_id is null or p.id <> v_excluded_creator_id);

    get diagnostics v_creator_count = row_count;
  end if;

  if v_creator_count = 0 then
    raise exception 'Cannot update SF seed event creators: no eligible profiles found in city %', v_city_id;
  end if;

  create temporary table tmp_sf_seed_events (
    event_id uuid not null,
    event_rn integer not null
  ) on commit drop;

  insert into tmp_sf_seed_events (event_id, event_rn)
  select
    e.id,
    row_number() over (order by e.starts_at asc, lower(e.title) asc, e.id asc)::int
  from public.events as e
  where e.city_id = v_city_id
    and e.metadata ->> 'seed_batch' = v_seed_batch
    and e.metadata ->> 'seed_source' = v_seed_source;

  get diagnostics v_event_count = row_count;

  if v_event_count = 0 then
    raise notice 'No SF seed events found for batch %, skipping creator update', v_seed_batch;
  else
    with picks as (
      select
        e.event_id,
        (((e.event_rn - 1) % v_creator_count) + 1)::int as pick_rn
      from tmp_sf_seed_events as e
    )
    update public.events as ev
    set
      created_by = c.user_id,
      updated_at = timezone('utc', now())
    from picks as p
    join tmp_sf_event_creators as c
      on c.user_rn = p.pick_rn
    where ev.id = p.event_id
      and ev.created_by is distinct from c.user_id;

    get diagnostics v_updated_count = row_count;

    raise notice 'Updated % of % SF seed events to use % eligible creators (excluded: %)',
      v_updated_count,
      v_event_count,
      v_creator_count,
      v_excluded_creator_id;
  end if;
end
$$;

