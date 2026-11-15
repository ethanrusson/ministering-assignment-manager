-- Phase 3 of docs/ward-map-prd.md: flags and labels (Checkpoint 3 answers).

-- Sensitive labels are hidden unless "Show sensitive" is on.
alter table public.labels
  add column sensitive boolean not null default false;

-- One free-text note per household (treated as sensitive).
alter table public.households
  add column note text;

-- One row per ministering import, so "New since last import" can expire.
create table public.lcr_imports (
  id         uuid primary key default gen_random_uuid(),
  ward_id    uuid not null references public.wards(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index lcr_imports_ward_created on public.lcr_imports (ward_id, created_at desc);

-- An acknowledged flag holds while the household keeps the same companionship.
create table public.flag_acknowledgements (
  id               uuid primary key default gen_random_uuid(),
  ward_id          uuid not null references public.wards(id) on delete cascade,
  household_id     uuid not null references public.households(id) on delete cascade,
  flag             text not null check (flag in ('far_from_ministers', 'other_district')),
  companionship_id uuid not null references public.companionships(id) on delete cascade,
  note             text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (household_id, flag)
);

create index flag_acknowledgements_ward_id on public.flag_acknowledgements (ward_id);

alter table public.lcr_imports           enable row level security;
alter table public.flag_acknowledgements enable row level security;

create policy lcr_imports_all on public.lcr_imports
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));
create policy flag_acknowledgements_all on public.flag_acknowledgements
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));

alter publication supabase_realtime add table public.lcr_imports;
alter publication supabase_realtime add table public.flag_acknowledgements;

-- Label colors come from a fixed palette (src/lib/labelColors.ts); move any
-- other color to the nearest palette entry.
update public.labels l
set color = (
  select p.hex
  from (values ('#db2777'), ('#a21caf'), ('#0284c7'), ('#047857'),
               ('#4338ca'), ('#ca8a04'), ('#57534e'), ('#7c2d12')) as p(hex)
  order by
    power(('x' || substr(l.color, 2, 2))::bit(8)::int - ('x' || substr(p.hex, 2, 2))::bit(8)::int, 2) +
    power(('x' || substr(l.color, 4, 2))::bit(8)::int - ('x' || substr(p.hex, 4, 2))::bit(8)::int, 2) +
    power(('x' || substr(l.color, 6, 2))::bit(8)::int - ('x' || substr(p.hex, 6, 2))::bit(8)::int, 2)
  limit 1
)
where l.color ~* '^#[0-9a-f]{6}$'
  and lower(l.color) not in ('#db2777', '#a21caf', '#0284c7', '#047857',
                             '#4338ca', '#ca8a04', '#57534e', '#7c2d12');
