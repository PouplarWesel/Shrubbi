


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."delete_my_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users
  where id = (select auth.uid());
end;
$$;


ALTER FUNCTION "public"."delete_my_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_team_city_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_city_id uuid;
  v_team_city_id uuid;
begin
  select p.city_id into v_user_city_id
  from public.profiles as p
  where p.id = new.user_id;

  if v_user_city_id is null then
    raise exception 'User % must select a city before joining a team', new.user_id;
  end if;

  select t.city_id into v_team_city_id
  from public.teams as t
  where t.id = new.team_id;

  if v_team_city_id is null then
    raise exception 'Team % does not exist', new.team_id;
  end if;

  if v_user_city_id <> v_team_city_id then
    raise exception 'Team city must match profile city';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_team_city_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    full_name,
    city,
    state,
    country,
    avatar_url
  )
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'city'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'state'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'country'), ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        city = coalesce(public.profiles.city, excluded.city),
        state = coalesce(public.profiles.state, excluded.state),
        country = coalesce(public.profiles.country, excluded.country),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = timezone('utc'::text, now());

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_plants"("search_text" "text", "max_results" integer DEFAULT 20) RETURNS TABLE("plant_id" "uuid", "common_name" "text", "scientific_name" "text", "matched_name" "text", "match_source" "text")
    LANGUAGE "sql" STABLE
    AS $$
with input as (
  select
    trim(coalesce(search_text, '')) as q,
    greatest(1, least(coalesce(max_results, 20), 50)) as lim
),
matches as (
  select
    p.id as plant_id,
    p.common_name,
    p.scientific_name,
    p.common_name as matched_name,
    'common_name'::text as match_source,
    (
      case
        when lower(p.common_name) = lower(i.q) then 300
        when lower(p.common_name) like lower(i.q) || '%' then 200
        when p.common_name ilike '%' || i.q || '%' then 100
        else 0
      end
      + similarity(lower(p.common_name), lower(i.q)) * 50
    ) as score
  from public.plants as p
  cross join input as i
  where i.q <> ''
    and p.common_name ilike '%' || i.q || '%'

  union all

  select
    p.id as plant_id,
    p.common_name,
    p.scientific_name,
    p.scientific_name as matched_name,
    'scientific_name'::text as match_source,
    (
      case
        when lower(p.scientific_name) = lower(i.q) then 290
        when lower(p.scientific_name) like lower(i.q) || '%' then 190
        when p.scientific_name ilike '%' || i.q || '%' then 90
        else 0
      end
      + similarity(lower(p.scientific_name), lower(i.q)) * 50
    ) as score
  from public.plants as p
  cross join input as i
  where i.q <> ''
    and p.scientific_name is not null
    and p.scientific_name ilike '%' || i.q || '%'

  union all

  select
    p.id as plant_id,
    p.common_name,
    p.scientific_name,
    a.alias_name as matched_name,
    'alias'::text as match_source,
    (
      case
        when lower(a.alias_name) = lower(i.q) then 280
        when lower(a.alias_name) like lower(i.q) || '%' then 180
        when a.alias_name ilike '%' || i.q || '%' then 80
        else 0
      end
      + similarity(lower(a.alias_name), lower(i.q)) * 50
    ) as score
  from public.plants as p
  join public.plant_aliases as a on a.plant_id = p.id
  cross join input as i
  where i.q <> ''
    and a.alias_name ilike '%' || i.q || '%'
),
best_match as (
  select
    m.*,
    row_number() over (
      partition by m.plant_id
      order by m.score desc, char_length(m.matched_name), m.matched_name
    ) as rn
  from matches as m
)
select
  b.plant_id,
  b.common_name,
  b.scientific_name,
  b.matched_name,
  b.match_source
from best_match as b
cross join input as i
where b.rn = 1
order by b.score desc, b.common_name
limit (select lim from input);
$$;


ALTER FUNCTION "public"."search_plants"("search_text" "text", "max_results" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_profile_city_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.city_id is null then
    new.city := null;
    new.state := null;
    new.country := null;
  else
    select c.name, c.state, c.country
    into new.city, new.state, new.country
    from public.cities as c
    where c.id = new.city_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_profile_city_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_public_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.public_profiles (
    id,
    display_name,
    city,
    state,
    country,
    avatar_url
  )
  values (
    new.id,
    coalesce(new.display_name, new.full_name),
    new.city,
    new.state,
    new.country,
    new.avatar_url
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        city = excluded.city,
        state = excluded.state,
        country = excluded.country,
        avatar_url = excluded.avatar_url,
        updated_at = timezone('utc'::text, now());

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_public_profile"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."cities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "region" "text",
    "country_code" "text" DEFAULT 'US'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "state" "text",
    "country" "text" DEFAULT 'United States'::"text" NOT NULL,
    CONSTRAINT "cities_country_code_len_chk" CHECK (("char_length"("country_code") = 2))
);


ALTER TABLE "public"."cities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "common_name" "text" NOT NULL,
    "scientific_name" "text",
    "is_native" boolean DEFAULT false NOT NULL,
    "is_endangered" boolean DEFAULT false NOT NULL,
    "is_invasive" boolean DEFAULT false NOT NULL,
    "is_tree" boolean DEFAULT false NOT NULL,
    "default_co2_kg_per_year" numeric(12,4) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "plants_default_co2_nonnegative_chk" CHECK (("default_co2_kg_per_year" >= (0)::numeric))
);


ALTER TABLE "public"."plants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "city" "text",
    "display_name" "text",
    "city_id" "uuid",
    "state" "text",
    "country" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_plants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plant_id" "uuid",
    "custom_name" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "planted_on" "date" NOT NULL,
    "co2_kg_per_year_override" numeric(12,4),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "user_plants_co2_override_nonnegative_chk" CHECK ((("co2_kg_per_year_override" IS NULL) OR ("co2_kg_per_year_override" >= (0)::numeric))),
    CONSTRAINT "user_plants_name_or_catalog_chk" CHECK ((("plant_id" IS NOT NULL) OR (NULLIF("btrim"("custom_name"), ''::"text") IS NOT NULL))),
    CONSTRAINT "user_plants_quantity_positive_chk" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."user_plants" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."city_leaderboard" WITH ("security_invoker"='true') AS
 SELECT "c"."id" AS "city_id",
    "c"."name" AS "city_name",
    "c"."state" AS "city_state",
    "c"."country" AS "city_country",
    "c"."country_code",
    "count"(DISTINCT "p"."id") AS "member_count",
    COALESCE("sum"("up"."quantity"), (0)::bigint) AS "total_plants",
    (COALESCE("sum"((((COALESCE("up"."co2_kg_per_year_override", "pl"."default_co2_kg_per_year", (0)::numeric) * (GREATEST((CURRENT_DATE - "up"."planted_on"), 0))::numeric) / 365.0) * ("up"."quantity")::numeric)), (0)::numeric))::numeric(14,4) AS "total_co2_removed_kg"
   FROM ((("public"."cities" "c"
     LEFT JOIN "public"."profiles" "p" ON (("p"."city_id" = "c"."id")))
     LEFT JOIN "public"."user_plants" "up" ON (("up"."user_id" = "p"."id")))
     LEFT JOIN "public"."plants" "pl" ON (("pl"."id" = "up"."plant_id")))
  WHERE (EXISTS ( SELECT 1
           FROM "public"."profiles" "viewer"
          WHERE (("viewer"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("viewer"."city_id" IS NOT NULL))))
  GROUP BY "c"."id", "c"."name", "c"."state", "c"."country", "c"."country_code";


ALTER VIEW "public"."city_leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plant_id" "uuid" NOT NULL,
    "alias_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."plant_aliases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "city" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "state" "text",
    "country" "text"
);


ALTER TABLE "public"."public_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_memberships" (
    "user_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "team_memberships_role_chk" CHECK (("role" = ANY (ARRAY['member'::"text", 'captain'::"text"])))
);


ALTER TABLE "public"."team_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "city_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."team_leaderboard" WITH ("security_invoker"='true') AS
 SELECT "t"."id" AS "team_id",
    "t"."name" AS "team_name",
    "t"."city_id",
    "c"."name" AS "city_name",
    "c"."state" AS "city_state",
    "c"."country" AS "city_country",
    "c"."country_code",
    "count"(DISTINCT "tm"."user_id") AS "member_count",
    COALESCE("sum"("up"."quantity"), (0)::bigint) AS "total_plants",
    (COALESCE("sum"((((COALESCE("up"."co2_kg_per_year_override", "pl"."default_co2_kg_per_year", (0)::numeric) * (GREATEST((CURRENT_DATE - "up"."planted_on"), 0))::numeric) / 365.0) * ("up"."quantity")::numeric)), (0)::numeric))::numeric(14,4) AS "total_co2_removed_kg"
   FROM (((("public"."teams" "t"
     JOIN "public"."cities" "c" ON (("c"."id" = "t"."city_id")))
     LEFT JOIN "public"."team_memberships" "tm" ON (("tm"."team_id" = "t"."id")))
     LEFT JOIN "public"."user_plants" "up" ON (("up"."user_id" = "tm"."user_id")))
     LEFT JOIN "public"."plants" "pl" ON (("pl"."id" = "up"."plant_id")))
  WHERE (EXISTS ( SELECT 1
           FROM "public"."profiles" "viewer"
          WHERE (("viewer"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("viewer"."city_id" IS NOT NULL))))
  GROUP BY "t"."id", "t"."name", "t"."city_id", "c"."name", "c"."state", "c"."country", "c"."country_code";


ALTER VIEW "public"."team_leaderboard" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cities"
    ADD CONSTRAINT "cities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plant_aliases"
    ADD CONSTRAINT "plant_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plants"
    ADD CONSTRAINT "plants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_profiles"
    ADD CONSTRAINT "public_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_memberships"
    ADD CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("user_id", "team_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_plants"
    ADD CONSTRAINT "user_plants_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "cities_name_region_country_key" ON "public"."cities" USING "btree" ("lower"("name"), "lower"(COALESCE("region", ''::"text")), "upper"("country_code"));



CREATE INDEX "plant_aliases_alias_name_trgm_idx" ON "public"."plant_aliases" USING "gin" ("lower"("alias_name") "extensions"."gin_trgm_ops");



CREATE UNIQUE INDEX "plant_aliases_plant_alias_key" ON "public"."plant_aliases" USING "btree" ("plant_id", "lower"("alias_name"));



CREATE INDEX "plants_common_name_trgm_idx" ON "public"."plants" USING "gin" ("lower"("common_name") "extensions"."gin_trgm_ops");



CREATE UNIQUE INDEX "plants_name_key" ON "public"."plants" USING "btree" ("lower"("common_name"), "lower"(COALESCE("scientific_name", ''::"text")));



CREATE INDEX "plants_scientific_name_trgm_idx" ON "public"."plants" USING "gin" ("lower"("scientific_name") "extensions"."gin_trgm_ops") WHERE ("scientific_name" IS NOT NULL);



CREATE INDEX "profiles_city_id_idx" ON "public"."profiles" USING "btree" ("city_id");



CREATE INDEX "team_memberships_team_id_idx" ON "public"."team_memberships" USING "btree" ("team_id");



CREATE INDEX "teams_city_id_idx" ON "public"."teams" USING "btree" ("city_id");



CREATE UNIQUE INDEX "teams_city_name_key" ON "public"."teams" USING "btree" ("city_id", "lower"("name"));



CREATE INDEX "user_plants_plant_id_idx" ON "public"."user_plants" USING "btree" ("plant_id");



CREATE INDEX "user_plants_planted_on_idx" ON "public"."user_plants" USING "btree" ("planted_on");



CREATE INDEX "user_plants_user_id_idx" ON "public"."user_plants" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "enforce_team_city_membership_before_write" BEFORE INSERT OR UPDATE ON "public"."team_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_team_city_membership"();



CREATE OR REPLACE TRIGGER "set_cities_updated_at" BEFORE UPDATE ON "public"."cities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_plants_updated_at" BEFORE UPDATE ON "public"."plants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_profile_city_name_before_write" BEFORE INSERT OR UPDATE OF "city_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_profile_city_name"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_public_profiles_updated_at" BEFORE UPDATE ON "public"."public_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_plants_updated_at" BEFORE UPDATE ON "public"."user_plants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sync_public_profile_after_profiles_change" AFTER INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_public_profile"();



ALTER TABLE ONLY "public"."plant_aliases"
    ADD CONSTRAINT "plant_aliases_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_profiles"
    ADD CONSTRAINT "public_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_memberships"
    ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_memberships"
    ADD CONSTRAINT "team_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_plants"
    ADD CONSTRAINT "user_plants_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_plants"
    ADD CONSTRAINT "user_plants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."cities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cities_select_all" ON "public"."cities" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."plant_aliases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plant_aliases_select_all" ON "public"."plant_aliases" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."plants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plants_select_all" ON "public"."plants" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."public_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_profiles_select_authenticated" ON "public"."public_profiles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."team_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_memberships_delete_own" ON "public"."team_memberships" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "team_memberships_insert_own" ON "public"."team_memberships" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "team_memberships_select_all" ON "public"."team_memberships" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_select_all" ON "public"."teams" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."user_plants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_plants_delete_own" ON "public"."user_plants" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_plants_insert_own" ON "public"."user_plants" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_plants_select_own" ON "public"."user_plants" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_plants_update_own" ON "public"."user_plants" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































































































































REVOKE ALL ON FUNCTION "public"."delete_my_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."enforce_team_city_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_team_city_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_team_city_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_plants"("search_text" "text", "max_results" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_plants"("search_text" "text", "max_results" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."search_plants"("search_text" "text", "max_results" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."set_profile_city_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_profile_city_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_profile_city_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_public_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_public_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_public_profile"() TO "service_role";


















GRANT ALL ON TABLE "public"."cities" TO "service_role";
GRANT SELECT ON TABLE "public"."cities" TO "authenticated";



GRANT ALL ON TABLE "public"."plants" TO "service_role";
GRANT SELECT ON TABLE "public"."plants" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."user_plants" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_plants" TO "authenticated";



GRANT ALL ON TABLE "public"."city_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."city_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."city_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."plant_aliases" TO "service_role";
GRANT SELECT ON TABLE "public"."plant_aliases" TO "authenticated";



GRANT ALL ON TABLE "public"."public_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."public_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."team_memberships" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."team_memberships" TO "authenticated";



GRANT ALL ON TABLE "public"."teams" TO "service_role";
GRANT SELECT ON TABLE "public"."teams" TO "authenticated";



GRANT ALL ON TABLE "public"."team_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."team_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."team_leaderboard" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



























