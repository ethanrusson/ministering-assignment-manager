-- Ministering Assignment Manager — initial schema
-- Run via: supabase db push  (or paste into SQL editor for first setup)

create extension if not exists "pgcrypto";

------------------------------------------------------------
-- Tables
------------------------------------------------------------

create table public.wards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'My Ward',
  created_at timestamptz not null default now()
);

create table public.elders (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references public.wards(id) on delete cascade,
  name text not null,
  age integer,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index elders_ward_id_idx on public.elders(ward_id);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references public.wards(id) on delete cascade,
  name text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index households_ward_id_idx on public.households(ward_id);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references public.wards(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now(),
  unique (ward_id, name)
);
create index labels_ward_id_idx on public.labels(ward_id);

create table public.household_labels (
  household_id uuid not null references public.households(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (household_id, label_id)
);

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references public.wards(id) on delete cascade,
  name text not null,
  position_x integer not null default 0,
  position_y integer not null default 0,
  width integer not null default 600,
  height integer not null default 400,
  created_at timestamptz not null default now()
);
create index districts_ward_id_idx on public.districts(ward_id);

create table public.companionships (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references public.wards(id) on delete cascade,
  district_id uuid references public.districts(id) on delete set null,
  position_x integer not null default 0,
  position_y integer not null default 0,
  created_at timestamptz not null default now()
);
create index companionships_ward_id_idx on public.companionships(ward_id);
create index companionships_district_id_idx on public.companionships(district_id);

create table public.companionship_elders (
  companionship_id uuid not null references public.companionships(id) on delete cascade,
  elder_id uuid not null references public.elders(id) on delete cascade,
  primary key (companionship_id, elder_id),
  unique (elder_id) -- enforce: an elder can only belong to one companionship
);

create table public.companionship_households (
  companionship_id uuid not null references public.companionships(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  primary key (companionship_id, household_id),
  unique (household_id) -- v1 constraint: a household belongs to at most one companionship
);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references public.wards(id) on delete cascade,
  name text not null,
  state jsonb not null,
  created_at timestamptz not null default now()
);
create index snapshots_ward_id_idx on public.snapshots(ward_id);

------------------------------------------------------------
-- Auto-create a ward on user signup
------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wards (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------
-- RLS
------------------------------------------------------------

alter table public.wards enable row level security;
alter table public.elders enable row level security;
alter table public.households enable row level security;
alter table public.labels enable row level security;
alter table public.household_labels enable row level security;
alter table public.districts enable row level security;
alter table public.companionships enable row level security;
alter table public.companionship_elders enable row level security;
alter table public.companionship_households enable row level security;
alter table public.snapshots enable row level security;

-- wards: a user owns exactly one ward
create policy wards_select on public.wards
  for select using (user_id = auth.uid());
create policy wards_insert on public.wards
  for insert with check (user_id = auth.uid());
create policy wards_update on public.wards
  for update using (user_id = auth.uid());
create policy wards_delete on public.wards
  for delete using (user_id = auth.uid());

-- helper: a ward_id belongs to the current user
create or replace function public.is_my_ward(ward uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.wards w where w.id = ward and w.user_id = auth.uid());
$$;

-- ward-scoped tables: same policy shape
create policy elders_all on public.elders
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));
create policy households_all on public.households
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));
create policy labels_all on public.labels
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));
create policy districts_all on public.districts
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));
create policy companionships_all on public.companionships
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));
create policy snapshots_all on public.snapshots
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));

-- join tables: scope through their parent
create policy household_labels_all on public.household_labels
  for all using (
    exists (select 1 from public.households h where h.id = household_id and is_my_ward(h.ward_id))
  ) with check (
    exists (select 1 from public.households h where h.id = household_id and is_my_ward(h.ward_id))
  );

create policy companionship_elders_all on public.companionship_elders
  for all using (
    exists (select 1 from public.companionships c where c.id = companionship_id and is_my_ward(c.ward_id))
  ) with check (
    exists (select 1 from public.companionships c where c.id = companionship_id and is_my_ward(c.ward_id))
  );

create policy companionship_households_all on public.companionship_households
  for all using (
    exists (select 1 from public.companionships c where c.id = companionship_id and is_my_ward(c.ward_id))
  ) with check (
    exists (select 1 from public.companionships c where c.id = companionship_id and is_my_ward(c.ward_id))
  );
