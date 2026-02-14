


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."chat_attachment_kind" AS ENUM (
    'image',
    'gif',
    'file'
);


ALTER TYPE "public"."chat_attachment_kind" OWNER TO "postgres";


CREATE TYPE "public"."chat_channel_scope" AS ENUM (
    'city',
    'team'
);


ALTER TYPE "public"."chat_channel_scope" OWNER TO "postgres";


CREATE TYPE "public"."chat_message_kind" AS ENUM (
    'text',
    'image',
    'gif',
    'system'
);


ALTER TYPE "public"."chat_message_kind" OWNER TO "postgres";


CREATE TYPE "public"."event_attendance_status" AS ENUM (
    'going',
    'waitlist',
    'cancelled'
);


ALTER TYPE "public"."event_attendance_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_channel_id_from_storage_path"("p_path" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  v_channel_id_text text;
begin
  v_channel_id_text := (storage.foldername(p_path))[1];

  if v_channel_id_text is null then
    return null;
  end if;

  begin
    return v_channel_id_text::uuid;
  exception
    when others then
      return null;
  end;
end;
$$;


ALTER FUNCTION "public"."chat_channel_id_from_storage_path"("p_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_create_thread"("p_channel_id" "uuid", "p_body" "text", "p_title" "text" DEFAULT NULL::"text", "p_kind" "public"."chat_message_kind" DEFAULT 'text'::"public"."chat_message_kind", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("thread_id" "uuid", "root_message_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'chat_create_thread requires an authenticated user';
  end if;

  if not public.chat_user_can_access_channel(p_channel_id, v_user_id) then
    raise exception 'user % does not have access to channel %', v_user_id, p_channel_id;
  end if;

  insert into public.chat_threads (
    channel_id,
    created_by,
    title
  )
  values (
    p_channel_id,
    v_user_id,
    nullif(btrim(coalesce(p_title, '')), '')
  )
  returning id into thread_id;

  insert into public.chat_messages (
    channel_id,
    thread_id,
    sender_id,
    kind,
    body,
    metadata
  )
  values (
    p_channel_id,
    thread_id,
    v_user_id,
    coalesce(p_kind, 'text'::public.chat_message_kind),
    p_body,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into root_message_id;

  return next;
end;
$$;


ALTER FUNCTION "public"."chat_create_thread"("p_channel_id" "uuid", "p_body" "text", "p_title" "text", "p_kind" "public"."chat_message_kind", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_prepare_channel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_city_id uuid;
  v_name text;
begin
  if new.scope = 'city'::public.chat_channel_scope then
    if new.city_id is null then
      raise exception 'city chat channels require city_id';
    end if;

    new.team_id := null;

    if nullif(btrim(coalesce(new.display_name, '')), '') is null then
      select c.name
      into v_name
      from public.cities as c
      where c.id = new.city_id;

      if v_name is null then
        raise exception 'city % does not exist', new.city_id;
      end if;

      new.display_name := v_name || ' Community';
    end if;
  elsif new.scope = 'team'::public.chat_channel_scope then
    if new.team_id is null then
      raise exception 'team chat channels require team_id';
    end if;

    select t.city_id, t.name
    into v_city_id, v_name
    from public.teams as t
    where t.id = new.team_id;

    if v_city_id is null then
      raise exception 'team % does not exist', new.team_id;
    end if;

    new.city_id := v_city_id;

    if nullif(btrim(coalesce(new.display_name, '')), '') is null then
      new.display_name := v_name;
    end if;
  else
    raise exception 'unsupported channel scope %', new.scope;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."chat_prepare_channel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_send_message"("p_channel_id" "uuid", "p_body" "text" DEFAULT NULL::"text", "p_kind" "public"."chat_message_kind" DEFAULT 'text'::"public"."chat_message_kind", "p_reply_to_message_id" "uuid" DEFAULT NULL::"uuid", "p_thread_id" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  v_message_id uuid;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'chat_send_message requires an authenticated user';
  end if;

  if not public.chat_user_can_access_channel(p_channel_id, v_user_id) then
    raise exception 'user % does not have access to channel %', v_user_id, p_channel_id;
  end if;

  insert into public.chat_messages (
    channel_id,
    thread_id,
    sender_id,
    reply_to_message_id,
    kind,
    body,
    metadata
  )
  values (
    p_channel_id,
    p_thread_id,
    v_user_id,
    p_reply_to_message_id,
    coalesce(p_kind, 'text'::public.chat_message_kind),
    p_body,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_message_id;

  return v_message_id;
end;
$$;


ALTER FUNCTION "public"."chat_send_message"("p_channel_id" "uuid", "p_body" "text", "p_kind" "public"."chat_message_kind", "p_reply_to_message_id" "uuid", "p_thread_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_sync_city_channel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.chat_channels (scope, city_id, display_name)
  values ('city'::public.chat_channel_scope, new.id, new.name || ' Community')
  on conflict do nothing;

  update public.chat_channels as cc
  set
    display_name = new.name || ' Community',
    updated_at = timezone('utc', now())
  where cc.scope = 'city'::public.chat_channel_scope
    and cc.city_id = new.id;

  return new;
end;
$$;


ALTER FUNCTION "public"."chat_sync_city_channel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_sync_team_channel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.chat_channels (scope, city_id, team_id, display_name)
  values ('team'::public.chat_channel_scope, new.city_id, new.id, new.name)
  on conflict do nothing;

  update public.chat_channels as cc
  set
    city_id = new.city_id,
    display_name = new.name,
    updated_at = timezone('utc', now())
  where cc.scope = 'team'::public.chat_channel_scope
    and cc.team_id = new.id;

  return new;
end;
$$;


ALTER FUNCTION "public"."chat_sync_team_channel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_user_can_access_channel"("p_channel_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := coalesce(p_user_id, (select auth.uid()));

  if p_channel_id is null or v_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.chat_channels as cc
    join public.profiles as p
      on p.id = v_user_id
    where cc.id = p_channel_id
      and (
        (cc.scope = 'city'::public.chat_channel_scope and p.city_id = cc.city_id)
        or (
          cc.scope = 'team'::public.chat_channel_scope
          and exists (
            select 1
            from public.teams as t
            where t.id = cc.team_id
              and (
                t.created_by = v_user_id
                or exists (
                  select 1
                  from public.team_memberships as tm
                  where tm.team_id = t.id
                    and tm.user_id = v_user_id
                )
              )
          )
        )
      )
  );
end;
$$;


ALTER FUNCTION "public"."chat_user_can_access_channel"("p_channel_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_user_can_access_message"("p_message_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := coalesce(p_user_id, (select auth.uid()));

  if p_message_id is null or v_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.chat_messages as cm
    where cm.id = p_message_id
      and public.chat_user_can_access_channel(cm.channel_id, v_user_id)
  );
end;
$$;


ALTER FUNCTION "public"."chat_user_can_access_message"("p_message_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_validate_attachment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_sender_id uuid;
  v_channel_id uuid;
  v_folders text[];
begin
  select cm.sender_id, cm.channel_id
  into v_sender_id, v_channel_id
  from public.chat_messages as cm
  where cm.id = new.message_id;

  if v_sender_id is null then
    raise exception 'message % does not exist', new.message_id;
  end if;

  if v_sender_id <> new.uploaded_by then
    raise exception 'attachment uploader must match message sender';
  end if;

  v_folders := storage.foldername(new.storage_path);
  if coalesce(array_length(v_folders, 1), 0) < 2 then
    raise exception 'storage_path must follow <channel_id>/<user_id>/<filename>';
  end if;

  if v_folders[1] <> v_channel_id::text then
    raise exception 'storage_path channel folder must match message channel';
  end if;

  if v_folders[2] <> new.uploaded_by::text then
    raise exception 'storage_path user folder must match uploader';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."chat_validate_attachment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."chat_validate_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_thread_channel_id uuid;
  v_reply_channel_id uuid;
  v_reply_thread_id uuid;
begin
  if new.thread_id is not null then
    select ct.channel_id
    into v_thread_channel_id
    from public.chat_threads as ct
    where ct.id = new.thread_id;

    if v_thread_channel_id is null then
      raise exception 'thread % does not exist', new.thread_id;
    end if;

    if v_thread_channel_id <> new.channel_id then
      raise exception 'thread % does not belong to channel %', new.thread_id, new.channel_id;
    end if;
  end if;

  if new.reply_to_message_id is not null then
    select cm.channel_id, cm.thread_id
    into v_reply_channel_id, v_reply_thread_id
    from public.chat_messages as cm
    where cm.id = new.reply_to_message_id;

    if v_reply_channel_id is null then
      raise exception 'reply target % does not exist', new.reply_to_message_id;
    end if;

    if v_reply_channel_id <> new.channel_id then
      raise exception 'reply target must be in the same channel';
    end if;

    if new.thread_id is null then
      new.thread_id := v_reply_thread_id;
    elsif v_reply_thread_id is distinct from new.thread_id then
      raise exception 'reply target thread does not match message thread';
    end if;
  end if;

  if new.kind = 'text'::public.chat_message_kind
    and nullif(btrim(coalesce(new.body, '')), '') is null then
    raise exception 'text messages require body';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."chat_validate_message"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."event_attendees_validate_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_event_city_id uuid;
  v_event_starts_at timestamp with time zone;
  v_event_sign_up_deadline timestamp with time zone;
  v_event_max_attendees integer;
  v_event_is_cancelled boolean;
  v_user_city_id uuid;
  v_going_count integer;
begin
  select
    e.city_id,
    e.starts_at,
    e.sign_up_deadline,
    e.max_attendees,
    e.is_cancelled
  into
    v_event_city_id,
    v_event_starts_at,
    v_event_sign_up_deadline,
    v_event_max_attendees,
    v_event_is_cancelled
  from public.events as e
  where e.id = new.event_id
  for update;

  if v_event_city_id is null then
    raise exception 'event % does not exist', new.event_id;
  end if;

  select p.city_id
  into v_user_city_id
  from public.profiles as p
  where p.id = new.user_id;

  if v_user_city_id is null then
    raise exception 'user % must select a city before signing up for events', new.user_id;
  end if;

  if v_user_city_id <> v_event_city_id then
    raise exception 'event city must match user city';
  end if;

  if new.status <> 'cancelled'::public.event_attendance_status then
    if v_event_is_cancelled then
      raise exception 'event % is cancelled', new.event_id;
    end if;

    if v_event_sign_up_deadline is not null
      and timezone('utc', now()) > v_event_sign_up_deadline then
      raise exception 'sign up deadline has passed for event %', new.event_id;
    end if;

    if timezone('utc', now()) >= v_event_starts_at then
      raise exception 'event % already started', new.event_id;
    end if;
  end if;

  if new.status = 'going'::public.event_attendance_status
    and v_event_max_attendees is not null then
    if tg_op = 'UPDATE' then
      select count(*)
      into v_going_count
      from public.event_attendees as ea
      where ea.event_id = new.event_id
        and ea.status = 'going'::public.event_attendance_status
        and ea.user_id <> old.user_id;
    else
      select count(*)
      into v_going_count
      from public.event_attendees as ea
      where ea.event_id = new.event_id
        and ea.status = 'going'::public.event_attendance_status;
    end if;

    if v_going_count >= v_event_max_attendees then
      raise exception 'event % is full', new.event_id;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."event_attendees_validate_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_user_can_access"("p_event_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := coalesce(p_user_id, (select auth.uid()));

  if p_event_id is null or v_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.events as e
    where e.id = p_event_id
      and public.event_user_in_same_city(e.city_id, v_user_id)
  );
end;
$$;


ALTER FUNCTION "public"."event_user_can_access"("p_event_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_user_in_same_city"("p_city_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := coalesce(p_user_id, (select auth.uid()));

  if p_city_id is null or v_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles as p
    where p.id = v_user_id
      and p.city_id = p_city_id
  );
end;
$$;


ALTER FUNCTION "public"."event_user_in_same_city"("p_city_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."events_prepare_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_creator_city_id uuid;
begin
  if tg_op = 'INSERT' then
    select p.city_id
    into v_creator_city_id
    from public.profiles as p
    where p.id = new.created_by;

    if v_creator_city_id is null then
      raise exception 'creator % must select a city before creating events', new.created_by;
    end if;

    if v_creator_city_id <> new.city_id then
      raise exception 'event city must match creator city';
    end if;
  elsif new.city_id is distinct from old.city_id
    or new.created_by is distinct from old.created_by then
    select p.city_id
    into v_creator_city_id
    from public.profiles as p
    where p.id = new.created_by;

    if v_creator_city_id is null then
      raise exception 'creator % must select a city before creating events', new.created_by;
    end if;

    if v_creator_city_id <> new.city_id then
      raise exception 'event city must match creator city';
    end if;
  end if;

  if new.is_cancelled then
    new.cancelled_at := coalesce(new.cancelled_at, timezone('utc', now()));
  else
    new.cancelled_at := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."events_prepare_write"() OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."chat_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "public"."chat_channel_scope" NOT NULL,
    "city_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "display_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "chat_channels_scope_chk" CHECK (((("scope" = 'city'::"public"."chat_channel_scope") AND ("team_id" IS NULL)) OR (("scope" = 'team'::"public"."chat_channel_scope") AND ("team_id" IS NOT NULL))))
);


ALTER TABLE "public"."chat_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_message_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "kind" "public"."chat_attachment_kind" NOT NULL,
    "storage_bucket" "text" DEFAULT 'chat-media'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size_bytes" integer NOT NULL,
    "width" integer,
    "height" integer,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "chat_message_attachments_height_chk" CHECK ((("height" IS NULL) OR ("height" > 0))),
    CONSTRAINT "chat_message_attachments_size_chk" CHECK (("file_size_bytes" > 0)),
    CONSTRAINT "chat_message_attachments_width_chk" CHECK ((("width" IS NULL) OR ("width" > 0)))
);


ALTER TABLE "public"."chat_message_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_message_reactions" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "chat_message_reactions_emoji_chk" CHECK (((NULLIF("btrim"("emoji"), ''::"text") IS NOT NULL) AND ("char_length"("emoji") <= 32)))
);


ALTER TABLE "public"."chat_message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "thread_id" "uuid",
    "sender_id" "uuid" NOT NULL,
    "reply_to_message_id" "uuid",
    "kind" "public"."chat_message_kind" DEFAULT 'text'::"public"."chat_message_kind" NOT NULL,
    "body" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "chat_messages_body_chk" CHECK ((("kind" <> 'text'::"public"."chat_message_kind") OR (NULLIF("btrim"(COALESCE("body", ''::"text")), ''::"text") IS NOT NULL))),
    CONSTRAINT "chat_messages_metadata_obj_chk" CHECK (("jsonb_typeof"("metadata") = 'object'::"text"))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "chat_threads_title_not_blank_chk" CHECK ((("title" IS NULL) OR (NULLIF("btrim"("title"), ''::"text") IS NOT NULL)))
);


ALTER TABLE "public"."chat_threads" OWNER TO "postgres";


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
    "default_co2_kg_per_year" numeric(12,4) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_native" boolean DEFAULT false NOT NULL,
    "is_endangered" boolean DEFAULT false NOT NULL,
    "is_invasive" boolean DEFAULT false NOT NULL,
    "type" "text" NOT NULL,
    "is_tree" boolean DEFAULT false NOT NULL,
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
    "photo_path" "text",
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


CREATE TABLE IF NOT EXISTS "public"."daily_tips" (
    "id" bigint NOT NULL,
    "tip_date" "date" NOT NULL,
    "tip_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "daily_tips_tip_text_not_blank_chk" CHECK ((NULLIF("btrim"("tip_text"), ''::"text") IS NOT NULL))
);


ALTER TABLE "public"."daily_tips" OWNER TO "postgres";


ALTER TABLE "public"."daily_tips" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."daily_tips_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."event_attendees" (
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "public"."event_attendance_status" DEFAULT 'going'::"public"."event_attendance_status" NOT NULL,
    "note" "text",
    "signed_up_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "event_attendees_note_not_blank_chk" CHECK ((("note" IS NULL) OR (NULLIF("btrim"("note"), ''::"text") IS NOT NULL)))
);


ALTER TABLE "public"."event_attendees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "city_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "activity_type" "text" DEFAULT 'community'::"text" NOT NULL,
    "location_name" "text" NOT NULL,
    "location_address" "text",
    "location_notes" "text",
    "latitude" double precision,
    "longitude" double precision,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "sign_up_deadline" timestamp with time zone,
    "max_attendees" integer,
    "is_cancelled" boolean DEFAULT false NOT NULL,
    "cancelled_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "events_activity_type_not_blank_chk" CHECK ((NULLIF("btrim"("activity_type"), ''::"text") IS NOT NULL)),
    CONSTRAINT "events_cancelled_consistency_chk" CHECK (((("is_cancelled" = false) AND ("cancelled_at" IS NULL)) OR (("is_cancelled" = true) AND ("cancelled_at" IS NOT NULL)))),
    CONSTRAINT "events_latitude_chk" CHECK ((("latitude" IS NULL) OR (("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision)))),
    CONSTRAINT "events_location_name_not_blank_chk" CHECK ((NULLIF("btrim"("location_name"), ''::"text") IS NOT NULL)),
    CONSTRAINT "events_longitude_chk" CHECK ((("longitude" IS NULL) OR (("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision)))),
    CONSTRAINT "events_max_attendees_chk" CHECK ((("max_attendees" IS NULL) OR ("max_attendees" > 0))),
    CONSTRAINT "events_metadata_obj_chk" CHECK (("jsonb_typeof"("metadata") = 'object'::"text")),
    CONSTRAINT "events_sign_up_deadline_chk" CHECK ((("sign_up_deadline" IS NULL) OR ("sign_up_deadline" <= "starts_at"))),
    CONSTRAINT "events_time_window_chk" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "events_title_not_blank_chk" CHECK ((NULLIF("btrim"("title"), ''::"text") IS NOT NULL))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plant_id" "uuid" NOT NULL,
    "alias_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."plant_aliases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plant_types" (
    "code" "text" NOT NULL,
    "display_name" "text" NOT NULL
);


ALTER TABLE "public"."plant_types" OWNER TO "postgres";


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


ALTER TABLE ONLY "public"."chat_channels"
    ADD CONSTRAINT "chat_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_message_attachments"
    ADD CONSTRAINT "chat_message_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_message_attachments"
    ADD CONSTRAINT "chat_message_attachments_unique_path" UNIQUE ("message_id", "storage_path");



ALTER TABLE ONLY "public"."chat_message_reactions"
    ADD CONSTRAINT "chat_message_reactions_pkey" PRIMARY KEY ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_threads"
    ADD CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cities"
    ADD CONSTRAINT "cities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_tips"
    ADD CONSTRAINT "daily_tips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_tips"
    ADD CONSTRAINT "daily_tips_tip_date_key" UNIQUE ("tip_date");



ALTER TABLE ONLY "public"."event_attendees"
    ADD CONSTRAINT "event_attendees_pkey" PRIMARY KEY ("event_id", "user_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plant_aliases"
    ADD CONSTRAINT "plant_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plant_types"
    ADD CONSTRAINT "plant_types_pkey" PRIMARY KEY ("code");



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



CREATE UNIQUE INDEX "chat_channels_city_scope_unique_idx" ON "public"."chat_channels" USING "btree" ("city_id") WHERE ("scope" = 'city'::"public"."chat_channel_scope");



CREATE INDEX "chat_channels_scope_city_idx" ON "public"."chat_channels" USING "btree" ("scope", "city_id");



CREATE INDEX "chat_channels_team_id_idx" ON "public"."chat_channels" USING "btree" ("team_id") WHERE ("team_id" IS NOT NULL);



CREATE UNIQUE INDEX "chat_channels_team_scope_unique_idx" ON "public"."chat_channels" USING "btree" ("team_id") WHERE ("scope" = 'team'::"public"."chat_channel_scope");



CREATE INDEX "chat_message_attachments_message_idx" ON "public"."chat_message_attachments" USING "btree" ("message_id", "created_at");



CREATE INDEX "chat_message_attachments_uploaded_by_idx" ON "public"."chat_message_attachments" USING "btree" ("uploaded_by", "created_at" DESC);



CREATE INDEX "chat_message_reactions_message_idx" ON "public"."chat_message_reactions" USING "btree" ("message_id", "created_at");



CREATE INDEX "chat_message_reactions_user_idx" ON "public"."chat_message_reactions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "chat_messages_channel_created_idx" ON "public"."chat_messages" USING "btree" ("channel_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "chat_messages_reply_to_idx" ON "public"."chat_messages" USING "btree" ("reply_to_message_id") WHERE ("reply_to_message_id" IS NOT NULL);



CREATE INDEX "chat_messages_sender_created_idx" ON "public"."chat_messages" USING "btree" ("sender_id", "created_at" DESC);



CREATE INDEX "chat_messages_thread_created_idx" ON "public"."chat_messages" USING "btree" ("thread_id", "created_at") WHERE (("thread_id" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "chat_threads_channel_created_idx" ON "public"."chat_threads" USING "btree" ("channel_id", "created_at" DESC);



CREATE INDEX "chat_threads_created_by_idx" ON "public"."chat_threads" USING "btree" ("created_by", "created_at" DESC);



CREATE UNIQUE INDEX "cities_name_region_country_key" ON "public"."cities" USING "btree" ("lower"("name"), "lower"(COALESCE("region", ''::"text")), "upper"("country_code"));



CREATE INDEX "event_attendees_event_going_idx" ON "public"."event_attendees" USING "btree" ("event_id") WHERE ("status" = 'going'::"public"."event_attendance_status");



CREATE INDEX "event_attendees_event_status_signed_idx" ON "public"."event_attendees" USING "btree" ("event_id", "status", "signed_up_at");



CREATE INDEX "event_attendees_user_status_signed_idx" ON "public"."event_attendees" USING "btree" ("user_id", "status", "signed_up_at" DESC);



CREATE INDEX "events_city_starts_idx" ON "public"."events" USING "btree" ("city_id", "starts_at") WHERE ("is_cancelled" = false);



CREATE INDEX "events_created_by_created_idx" ON "public"."events" USING "btree" ("created_by", "created_at" DESC);



CREATE INDEX "events_starts_at_idx" ON "public"."events" USING "btree" ("starts_at");



CREATE INDEX "plant_aliases_alias_name_trgm_idx" ON "public"."plant_aliases" USING "gin" ("lower"("alias_name") "extensions"."gin_trgm_ops");



CREATE UNIQUE INDEX "plant_aliases_plant_alias_key" ON "public"."plant_aliases" USING "btree" ("plant_id", "lower"("alias_name"));



CREATE INDEX "plants_common_name_trgm_idx" ON "public"."plants" USING "gin" ("lower"("common_name") "extensions"."gin_trgm_ops");



CREATE UNIQUE INDEX "plants_name_key" ON "public"."plants" USING "btree" ("lower"("common_name"), "lower"(COALESCE("scientific_name", ''::"text")));



CREATE INDEX "plants_scientific_name_trgm_idx" ON "public"."plants" USING "gin" ("lower"("scientific_name") "extensions"."gin_trgm_ops") WHERE ("scientific_name" IS NOT NULL);



CREATE INDEX "plants_type_idx" ON "public"."plants" USING "btree" ("type");



CREATE INDEX "profiles_city_id_idx" ON "public"."profiles" USING "btree" ("city_id");



CREATE INDEX "team_memberships_team_id_idx" ON "public"."team_memberships" USING "btree" ("team_id");



CREATE INDEX "teams_city_id_idx" ON "public"."teams" USING "btree" ("city_id");



CREATE UNIQUE INDEX "teams_city_name_key" ON "public"."teams" USING "btree" ("city_id", "lower"("name"));



CREATE INDEX "user_plants_plant_id_idx" ON "public"."user_plants" USING "btree" ("plant_id");



CREATE INDEX "user_plants_planted_on_idx" ON "public"."user_plants" USING "btree" ("planted_on");



CREATE INDEX "user_plants_user_id_idx" ON "public"."user_plants" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "chat_prepare_channel_before_write" BEFORE INSERT OR UPDATE ON "public"."chat_channels" FOR EACH ROW EXECUTE FUNCTION "public"."chat_prepare_channel"();



CREATE OR REPLACE TRIGGER "chat_sync_city_channel_after_write" AFTER INSERT OR UPDATE OF "name" ON "public"."cities" FOR EACH ROW EXECUTE FUNCTION "public"."chat_sync_city_channel"();



CREATE OR REPLACE TRIGGER "chat_sync_team_channel_after_write" AFTER INSERT OR UPDATE OF "name", "city_id" ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."chat_sync_team_channel"();



CREATE OR REPLACE TRIGGER "chat_validate_attachment_before_write" BEFORE INSERT OR UPDATE ON "public"."chat_message_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."chat_validate_attachment"();



CREATE OR REPLACE TRIGGER "chat_validate_message_before_write" BEFORE INSERT OR UPDATE ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."chat_validate_message"();



CREATE OR REPLACE TRIGGER "enforce_team_city_membership_before_write" BEFORE INSERT OR UPDATE ON "public"."team_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_team_city_membership"();



CREATE OR REPLACE TRIGGER "event_attendees_validate_write_before_write" BEFORE INSERT OR UPDATE ON "public"."event_attendees" FOR EACH ROW EXECUTE FUNCTION "public"."event_attendees_validate_write"();



CREATE OR REPLACE TRIGGER "events_prepare_write_before_write" BEFORE INSERT OR UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."events_prepare_write"();



CREATE OR REPLACE TRIGGER "set_chat_channels_updated_at" BEFORE UPDATE ON "public"."chat_channels" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_chat_messages_updated_at" BEFORE UPDATE ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_chat_threads_updated_at" BEFORE UPDATE ON "public"."chat_threads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_cities_updated_at" BEFORE UPDATE ON "public"."cities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_event_attendees_updated_at" BEFORE UPDATE ON "public"."event_attendees" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_events_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_plants_updated_at" BEFORE UPDATE ON "public"."plants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_profile_city_name_before_write" BEFORE INSERT OR UPDATE OF "city_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_profile_city_name"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_public_profiles_updated_at" BEFORE UPDATE ON "public"."public_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_plants_updated_at" BEFORE UPDATE ON "public"."user_plants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sync_public_profile_after_profiles_change" AFTER INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_public_profile"();



ALTER TABLE ONLY "public"."chat_channels"
    ADD CONSTRAINT "chat_channels_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_channels"
    ADD CONSTRAINT "chat_channels_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_message_attachments"
    ADD CONSTRAINT "chat_message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_message_attachments"
    ADD CONSTRAINT "chat_message_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_message_reactions"
    ADD CONSTRAINT "chat_message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_message_reactions"
    ADD CONSTRAINT "chat_message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_threads"
    ADD CONSTRAINT "chat_threads_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_threads"
    ADD CONSTRAINT "chat_threads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_attendees"
    ADD CONSTRAINT "event_attendees_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_attendees"
    ADD CONSTRAINT "event_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plant_aliases"
    ADD CONSTRAINT "plant_aliases_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plants"
    ADD CONSTRAINT "plants_type_fkey" FOREIGN KEY ("type") REFERENCES "public"."plant_types"("code");



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



CREATE POLICY "chat_attachments_delete_uploader" ON "public"."chat_message_attachments" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "uploaded_by") AND ("storage_bucket" = 'chat-media'::"text") AND ( SELECT "public"."chat_user_can_access_message"("chat_message_attachments"."message_id") AS "chat_user_can_access_message")));



CREATE POLICY "chat_attachments_insert_uploader" ON "public"."chat_message_attachments" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "uploaded_by") AND ("storage_bucket" = 'chat-media'::"text") AND ( SELECT "public"."chat_user_can_access_message"("chat_message_attachments"."message_id") AS "chat_user_can_access_message")));



CREATE POLICY "chat_attachments_select_member" ON "public"."chat_message_attachments" FOR SELECT TO "authenticated" USING (( SELECT "public"."chat_user_can_access_message"("chat_message_attachments"."message_id") AS "chat_user_can_access_message"));



CREATE POLICY "chat_attachments_update_uploader" ON "public"."chat_message_attachments" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "uploaded_by") AND ("storage_bucket" = 'chat-media'::"text") AND ( SELECT "public"."chat_user_can_access_message"("chat_message_attachments"."message_id") AS "chat_user_can_access_message"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "uploaded_by") AND ("storage_bucket" = 'chat-media'::"text") AND ( SELECT "public"."chat_user_can_access_message"("chat_message_attachments"."message_id") AS "chat_user_can_access_message")));



ALTER TABLE "public"."chat_channels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_channels_select_member" ON "public"."chat_channels" FOR SELECT TO "authenticated" USING (( SELECT "public"."chat_user_can_access_channel"("chat_channels"."id") AS "chat_user_can_access_channel"));



ALTER TABLE "public"."chat_message_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_messages_delete_sender" ON "public"."chat_messages" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "sender_id") AND ( SELECT "public"."chat_user_can_access_channel"("chat_messages"."channel_id") AS "chat_user_can_access_channel")));



CREATE POLICY "chat_messages_insert_member" ON "public"."chat_messages" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "sender_id") AND ( SELECT "public"."chat_user_can_access_channel"("chat_messages"."channel_id") AS "chat_user_can_access_channel")));



CREATE POLICY "chat_messages_select_member" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING (( SELECT "public"."chat_user_can_access_channel"("chat_messages"."channel_id") AS "chat_user_can_access_channel"));



CREATE POLICY "chat_messages_update_sender" ON "public"."chat_messages" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "sender_id") AND ( SELECT "public"."chat_user_can_access_channel"("chat_messages"."channel_id") AS "chat_user_can_access_channel"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "sender_id") AND ( SELECT "public"."chat_user_can_access_channel"("chat_messages"."channel_id") AS "chat_user_can_access_channel")));



CREATE POLICY "chat_reactions_delete_owner" ON "public"."chat_message_reactions" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ( SELECT "public"."chat_user_can_access_message"("chat_message_reactions"."message_id") AS "chat_user_can_access_message")));



CREATE POLICY "chat_reactions_insert_member" ON "public"."chat_message_reactions" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ( SELECT "public"."chat_user_can_access_message"("chat_message_reactions"."message_id") AS "chat_user_can_access_message")));



CREATE POLICY "chat_reactions_select_member" ON "public"."chat_message_reactions" FOR SELECT TO "authenticated" USING (( SELECT "public"."chat_user_can_access_message"("chat_message_reactions"."message_id") AS "chat_user_can_access_message"));



ALTER TABLE "public"."chat_threads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_threads_insert_member" ON "public"."chat_threads" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "created_by") AND ( SELECT "public"."chat_user_can_access_channel"("chat_threads"."channel_id") AS "chat_user_can_access_channel")));



CREATE POLICY "chat_threads_select_member" ON "public"."chat_threads" FOR SELECT TO "authenticated" USING (( SELECT "public"."chat_user_can_access_channel"("chat_threads"."channel_id") AS "chat_user_can_access_channel"));



CREATE POLICY "chat_threads_update_creator" ON "public"."chat_threads" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "created_by") AND ( SELECT "public"."chat_user_can_access_channel"("chat_threads"."channel_id") AS "chat_user_can_access_channel"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "created_by") AND ( SELECT "public"."chat_user_can_access_channel"("chat_threads"."channel_id") AS "chat_user_can_access_channel")));



ALTER TABLE "public"."cities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cities_select_all" ON "public"."cities" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."daily_tips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_tips_select_authenticated" ON "public"."daily_tips" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."event_attendees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_attendees_delete_self" ON "public"."event_attendees" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ( SELECT "public"."event_user_can_access"("event_attendees"."event_id") AS "event_user_can_access")));



CREATE POLICY "event_attendees_insert_self" ON "public"."event_attendees" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ( SELECT "public"."event_user_can_access"("event_attendees"."event_id") AS "event_user_can_access")));



CREATE POLICY "event_attendees_select_same_city" ON "public"."event_attendees" FOR SELECT TO "authenticated" USING (( SELECT "public"."event_user_can_access"("event_attendees"."event_id") AS "event_user_can_access"));



CREATE POLICY "event_attendees_update_self" ON "public"."event_attendees" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ( SELECT "public"."event_user_can_access"("event_attendees"."event_id") AS "event_user_can_access"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ( SELECT "public"."event_user_can_access"("event_attendees"."event_id") AS "event_user_can_access")));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_delete_creator" ON "public"."events" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "created_by") AND ( SELECT "public"."event_user_in_same_city"("events"."city_id") AS "event_user_in_same_city")));



CREATE POLICY "events_insert_creator_city" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "created_by") AND ( SELECT "public"."event_user_in_same_city"("events"."city_id") AS "event_user_in_same_city")));



CREATE POLICY "events_select_same_city" ON "public"."events" FOR SELECT TO "authenticated" USING (( SELECT "public"."event_user_in_same_city"("events"."city_id") AS "event_user_in_same_city"));



CREATE POLICY "events_update_creator" ON "public"."events" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "created_by") AND ( SELECT "public"."event_user_in_same_city"("events"."city_id") AS "event_user_in_same_city"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "created_by") AND ( SELECT "public"."event_user_in_same_city"("events"."city_id") AS "event_user_in_same_city")));



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


CREATE POLICY "teams_insert_own_city" ON "public"."teams" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "created_by") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."city_id" = "teams"."city_id"))))));



CREATE POLICY "teams_select_all" ON "public"."teams" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."user_plants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_plants_delete_own" ON "public"."user_plants" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plants_insert_own" ON "public"."user_plants" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plants_select_own" ON "public"."user_plants" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "user_plants_update_own" ON "public"."user_plants" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TYPE "public"."chat_attachment_kind" TO "authenticated";
GRANT ALL ON TYPE "public"."chat_attachment_kind" TO "service_role";



GRANT ALL ON TYPE "public"."chat_channel_scope" TO "authenticated";
GRANT ALL ON TYPE "public"."chat_channel_scope" TO "service_role";



GRANT ALL ON TYPE "public"."chat_message_kind" TO "authenticated";
GRANT ALL ON TYPE "public"."chat_message_kind" TO "service_role";



GRANT ALL ON TYPE "public"."event_attendance_status" TO "authenticated";
GRANT ALL ON TYPE "public"."event_attendance_status" TO "service_role";



REVOKE ALL ON FUNCTION "public"."chat_channel_id_from_storage_path"("p_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_channel_id_from_storage_path"("p_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."chat_channel_id_from_storage_path"("p_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_channel_id_from_storage_path"("p_path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."chat_create_thread"("p_channel_id" "uuid", "p_body" "text", "p_title" "text", "p_kind" "public"."chat_message_kind", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_create_thread"("p_channel_id" "uuid", "p_body" "text", "p_title" "text", "p_kind" "public"."chat_message_kind", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."chat_create_thread"("p_channel_id" "uuid", "p_body" "text", "p_title" "text", "p_kind" "public"."chat_message_kind", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_create_thread"("p_channel_id" "uuid", "p_body" "text", "p_title" "text", "p_kind" "public"."chat_message_kind", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_prepare_channel"() TO "anon";
GRANT ALL ON FUNCTION "public"."chat_prepare_channel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_prepare_channel"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."chat_send_message"("p_channel_id" "uuid", "p_body" "text", "p_kind" "public"."chat_message_kind", "p_reply_to_message_id" "uuid", "p_thread_id" "uuid", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_send_message"("p_channel_id" "uuid", "p_body" "text", "p_kind" "public"."chat_message_kind", "p_reply_to_message_id" "uuid", "p_thread_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."chat_send_message"("p_channel_id" "uuid", "p_body" "text", "p_kind" "public"."chat_message_kind", "p_reply_to_message_id" "uuid", "p_thread_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_send_message"("p_channel_id" "uuid", "p_body" "text", "p_kind" "public"."chat_message_kind", "p_reply_to_message_id" "uuid", "p_thread_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_sync_city_channel"() TO "anon";
GRANT ALL ON FUNCTION "public"."chat_sync_city_channel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_sync_city_channel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_sync_team_channel"() TO "anon";
GRANT ALL ON FUNCTION "public"."chat_sync_team_channel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_sync_team_channel"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."chat_user_can_access_channel"("p_channel_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_user_can_access_channel"("p_channel_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."chat_user_can_access_channel"("p_channel_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_user_can_access_channel"("p_channel_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."chat_user_can_access_message"("p_message_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."chat_user_can_access_message"("p_message_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."chat_user_can_access_message"("p_message_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_user_can_access_message"("p_message_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_validate_attachment"() TO "anon";
GRANT ALL ON FUNCTION "public"."chat_validate_attachment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_validate_attachment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."chat_validate_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."chat_validate_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."chat_validate_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_my_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "service_role";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."enforce_team_city_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_team_city_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_team_city_membership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."event_attendees_validate_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."event_attendees_validate_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."event_attendees_validate_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."event_attendees_validate_write"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."event_user_can_access"("p_event_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."event_user_can_access"("p_event_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."event_user_can_access"("p_event_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."event_user_can_access"("p_event_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."event_user_in_same_city"("p_city_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."event_user_in_same_city"("p_city_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."event_user_in_same_city"("p_city_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."event_user_in_same_city"("p_city_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."events_prepare_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."events_prepare_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."events_prepare_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."events_prepare_write"() TO "service_role";



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



GRANT ALL ON TABLE "public"."chat_channels" TO "anon";
GRANT ALL ON TABLE "public"."chat_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_channels" TO "service_role";



GRANT ALL ON TABLE "public"."chat_message_attachments" TO "anon";
GRANT ALL ON TABLE "public"."chat_message_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_message_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."chat_message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."chat_message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_threads" TO "anon";
GRANT ALL ON TABLE "public"."chat_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_threads" TO "service_role";



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



GRANT ALL ON TABLE "public"."daily_tips" TO "anon";
GRANT ALL ON TABLE "public"."daily_tips" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_tips" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_tips_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_tips_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_tips_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."event_attendees" TO "anon";
GRANT ALL ON TABLE "public"."event_attendees" TO "authenticated";
GRANT ALL ON TABLE "public"."event_attendees" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."plant_aliases" TO "service_role";
GRANT SELECT ON TABLE "public"."plant_aliases" TO "authenticated";



GRANT ALL ON TABLE "public"."plant_types" TO "anon";
GRANT ALL ON TABLE "public"."plant_types" TO "authenticated";
GRANT ALL ON TABLE "public"."plant_types" TO "service_role";



GRANT ALL ON TABLE "public"."public_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."public_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."team_memberships" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."team_memberships" TO "authenticated";



GRANT ALL ON TABLE "public"."teams" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."teams" TO "authenticated";



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







