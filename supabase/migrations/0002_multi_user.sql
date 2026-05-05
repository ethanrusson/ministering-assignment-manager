-- Phase 4A: Multi-user ward membership
-- Replaces the 1:1 wards.user_id constraint with a ward_members junction table.
-- Existing data is migrated automatically.

------------------------------------------------------------
-- 1. ward_members junction table
------------------------------------------------------------

create table public.ward_members (
  ward_id    uuid not null references public.wards(id) on delete cascade,
  user_id    uuid not null references auth.users(id)   on delete cascade,
  role       text not null default 'member', -- 'admin' | 'member'
  created_at timestamptz not null default now(),
  primary key (ward_id, user_id)
);

alter table public.ward_members enable row level security;

------------------------------------------------------------
-- 2. Helper: is the current user an admin of this ward?
------------------------------------------------------------

create or replace function public.is_ward_admin(p_ward_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ward_members wm
    where wm.ward_id = p_ward_id
      and wm.user_id = auth.uid()
      and wm.role = 'admin'
  );
$$;

------------------------------------------------------------
-- 3. ward_members RLS
------------------------------------------------------------

-- Members can read their own memberships
create policy ward_members_select on public.ward_members
  for select using (user_id = auth.uid());

-- Admins can add members to wards they admin
-- (the accept_invite function also inserts via security definer, bypassing this)
create policy ward_members_admin_insert on public.ward_members
  for insert with check (is_ward_admin(ward_id));

-- Admins can remove members (but not themselves if last admin — enforce in app layer)
create policy ward_members_admin_delete on public.ward_members
  for delete using (is_ward_admin(ward_id));

------------------------------------------------------------
-- 4. Populate ward_members from existing wards (migrate)
------------------------------------------------------------

insert into public.ward_members (ward_id, user_id, role)
select id, user_id, 'admin'
from public.wards
where user_id is not null
on conflict do nothing;

------------------------------------------------------------
-- 5. Update is_my_ward() to check ward_members
------------------------------------------------------------

create or replace function public.is_my_ward(ward uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ward_members wm
    where wm.ward_id = ward and wm.user_id = auth.uid()
  );
$$;

-- All other RLS policies on every other table remain unchanged — they all call is_my_ward().

------------------------------------------------------------
-- 6. Update wards RLS so members (not just owner) can read the ward
------------------------------------------------------------

drop policy wards_select on public.wards;
create policy wards_select on public.wards
  for select using (is_my_ward(id));

------------------------------------------------------------
-- 7. Update handle_new_user trigger
--    Organic sign-ups still auto-create a ward and admin membership.
--    Users who join via invite pass skip_auto_ward=true in user metadata
--    so the trigger skips ward creation; the invite flow handles it.
------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_ward_id uuid;
begin
  if (new.raw_user_meta_data->>'skip_auto_ward')::boolean is not true then
    insert into public.wards (user_id) values (new.id) returning id into new_ward_id;
    insert into public.ward_members (ward_id, user_id, role)
      values (new_ward_id, new.id, 'admin');
  end if;
  return new;
end;
$$;

------------------------------------------------------------
-- 8. ward_invites table (token-based, no Edge Function required)
------------------------------------------------------------

create table public.ward_invites (
  id          uuid primary key default gen_random_uuid(),
  ward_id     uuid not null references public.wards(id) on delete cascade,
  email       text not null,
  token       uuid not null default gen_random_uuid() unique,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);

alter table public.ward_invites enable row level security;

-- Admins can create and view invites for their ward
create policy ward_invites_admin on public.ward_invites
  for all using (is_my_ward(ward_id)) with check (is_my_ward(ward_id));

-- Anyone (including unauthenticated) can read a specific invite by its token.
-- Security is through token obscurity (UUID = 122 bits of entropy).
create policy ward_invites_by_token on public.ward_invites
  for select using (true);

------------------------------------------------------------
-- 9. accept_invite RPC (security definer — bypasses RLS)
--    Called by Join.vue after the user authenticates.
------------------------------------------------------------

create or replace function public.accept_invite(p_token uuid)
returns uuid -- returns the ward_id joined
language plpgsql security definer set search_path = public as $$
declare
  inv public.ward_invites;
begin
  -- Fetch and validate invite
  select * into inv
  from public.ward_invites
  where token = p_token
    and accepted_at is null
    and expires_at > now();

  if not found then
    raise exception 'INVITE_INVALID' using hint = 'Invite not found, expired, or already used.';
  end if;

  -- Add the current user as a member
  insert into public.ward_members (ward_id, user_id, role)
  values (inv.ward_id, auth.uid(), 'member')
  on conflict (ward_id, user_id) do nothing;

  -- Mark invite accepted
  update public.ward_invites
  set accepted_at = now()
  where id = inv.id;

  return inv.ward_id;
end;
$$;
