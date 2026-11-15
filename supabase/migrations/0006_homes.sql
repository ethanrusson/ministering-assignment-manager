-- Non-member homes on the ward map: faint squares between member households,
-- so it's clear when other houses sit between them. Imported from building
-- footprints or placed by hand. A home under a member household is hidden
-- when drawn, so rows never need cleaning up when someone moves in.

create table public.homes (
  id         uuid primary key default gen_random_uuid(),
  ward_id    uuid not null references public.wards(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  source     text not null check (source in ('footprint', 'manual')),
  created_at timestamptz not null default now()
);

create index homes_ward_id on public.homes (ward_id);

alter table public.homes enable row level security;

create policy homes_all on public.homes
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));

alter publication supabase_realtime add table public.homes;
