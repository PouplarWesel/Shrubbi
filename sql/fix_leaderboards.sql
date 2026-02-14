-- Fix city/team leaderboard views so they aggregate across all users (without exposing per-user rows).
--
-- Problem:
-- - The existing leaderboards were created with `security_invoker=true`, so RLS on `profiles` and
--   `user_plants` limits results to the current user (often showing zeros / not "filled").
--
-- Solution:
-- - Recreate the views and explicitly disable `security_invoker` so they run with the view owner
--   (postgres) and can aggregate across the underlying tables.
-- - Restrict access to authenticated + service_role.

create or replace view public.city_leaderboard as
select
  c.id as city_id,
  c.name as city_name,
  c.state as city_state,
  c.country as city_country,
  c.country_code,
  count(distinct p.id) as member_count,
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
from public.cities as c
left join public.profiles as p on p.city_id = c.id
left join public.user_plants as up on up.user_id = p.id
left join public.plants as pl on pl.id = up.plant_id
group by c.id, c.name, c.state, c.country, c.country_code;

create or replace view public.team_leaderboard as
select
  t.id as team_id,
  t.name as team_name,
  t.city_id,
  c.name as city_name,
  c.state as city_state,
  c.country as city_country,
  c.country_code,
  count(distinct tm.user_id) as member_count,
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
from public.teams as t
join public.cities as c on c.id = t.city_id
left join public.team_memberships as tm on tm.team_id = t.id
left join public.user_plants as up on up.user_id = tm.user_id
left join public.plants as pl on pl.id = up.plant_id
group by t.id, t.name, t.city_id, c.name, c.state, c.country, c.country_code;

-- Ensure they are SECURITY DEFINER-style views (RLS bypass for aggregated output).
alter view public.city_leaderboard set (security_invoker = false);
alter view public.team_leaderboard set (security_invoker = false);
alter view public.city_leaderboard owner to postgres;
alter view public.team_leaderboard owner to postgres;

-- Keep them private to signed-in users.
revoke all on public.city_leaderboard from anon;
revoke all on public.team_leaderboard from anon;
grant select on public.city_leaderboard to authenticated;
grant select on public.team_leaderboard to authenticated;
grant all on public.city_leaderboard to service_role;
grant all on public.team_leaderboard to service_role;

-- Optional: force PostgREST to reload schema immediately (Supabase).
notify pgrst, 'reload schema';

