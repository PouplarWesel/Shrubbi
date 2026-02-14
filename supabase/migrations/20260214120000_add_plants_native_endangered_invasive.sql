begin;
alter table public.plants
  add column if not exists native boolean not null default false,
  add column if not exists endangered boolean not null default false,
  add column if not exists invasive boolean not null default false;
commit;
