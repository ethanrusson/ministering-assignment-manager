-- Allow any ward admin (not just the original owner) to update the ward name.
-- The old policy checked user_id = auth.uid() which breaks for invited admins.

drop policy wards_update on public.wards;

create policy wards_update on public.wards
  for update using (is_ward_admin(id));
