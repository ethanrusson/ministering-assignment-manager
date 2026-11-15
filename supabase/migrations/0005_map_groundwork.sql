-- Ward map groundwork (docs/ward-map-prd.md, Phase 0).
--
-- Stable LCR identity for people, household locations, and the tables later
-- map phases write to. Nothing here changes existing behaviour: every new
-- column is nullable or defaulted, and the new tables start empty.

------------------------------------------------------------
-- 1. People: LCR identity and elder homes
------------------------------------------------------------

alter table public.elders
  add column lcr_uuid text,
  add column not_generally_assigned boolean not null default false,
  -- The household the elder lives in.
  add column home_household_id uuid references public.households(id) on delete set null;

alter table public.households
  add column lcr_uuid text,
  add column lat double precision,
  add column lng double precision,
  add column location_source text check (location_source in ('lcr', 'manual')),
  add column location_updated_at timestamptz,
  -- District membership on the map. Separate from companionships.district_id.
  add column district_id uuid references public.districts(id) on delete set null,
  add constraint households_lat_lng_pair check ((lat is null) = (lng is null));

-- One row per LCR person per ward. Partial so rows not yet linked can coexist.
create unique index elders_ward_lcr_uuid
  on public.elders (ward_id, lcr_uuid) where lcr_uuid is not null;
create unique index households_ward_lcr_uuid
  on public.households (ward_id, lcr_uuid) where lcr_uuid is not null;

create index elders_home_household_id on public.elders (home_household_id);
create index households_district_id on public.households (district_id);

------------------------------------------------------------
-- 2. Location groups: households that share one point (apartments)
------------------------------------------------------------

create table public.location_groups (
  id         uuid primary key default gen_random_uuid(),
  ward_id    uuid not null references public.wards(id) on delete cascade,
  name       text not null,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz not null default now()
);

alter table public.households
  add column location_group_id uuid references public.location_groups(id) on delete set null;

create index households_location_group_id on public.households (location_group_id);

------------------------------------------------------------
-- 3. Location review queue
------------------------------------------------------------

create table public.location_reviews (
  id           uuid primary key default gen_random_uuid(),
  ward_id      uuid not null references public.wards(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  kind         text not null
               check (kind in ('no_location', 'outside_ward', 'moved', 'shared_location')),
  data         jsonb not null default '{}'::jsonb,
  status       text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id) on delete set null
);

create index location_reviews_ward_open
  on public.location_reviews (ward_id) where status = 'open';
create index location_reviews_household_id on public.location_reviews (household_id);

------------------------------------------------------------
-- 4. Ward boundary and streets
------------------------------------------------------------

-- GeoJSON Polygon in lat/lng.
alter table public.wards add column boundary jsonb;

create table public.streets (
  id         uuid primary key default gen_random_uuid(),
  ward_id    uuid not null references public.wards(id) on delete cascade,
  name       text not null default '',
  kind       text not null default 'residential' check (kind in ('main', 'residential', 'lane')),
  -- GeoJSON LineString in lat/lng.
  geometry   jsonb not null,
  smooth     boolean not null default false,
  source     text not null default 'manual' check (source in ('osm', 'manual')),
  osm_id     text,
  created_at timestamptz not null default now()
);

create index streets_ward_id on public.streets (ward_id);

------------------------------------------------------------
-- 5. RLS: same shape as every other ward-scoped table
------------------------------------------------------------

alter table public.location_groups  enable row level security;
alter table public.location_reviews enable row level security;
alter table public.streets          enable row level security;

create policy location_groups_all on public.location_groups
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));
create policy location_reviews_all on public.location_reviews
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));
create policy streets_all on public.streets
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));

------------------------------------------------------------
-- 6. Realtime
------------------------------------------------------------

alter publication supabase_realtime add table public.location_groups;
alter publication supabase_realtime add table public.location_reviews;
alter publication supabase_realtime add table public.streets;
