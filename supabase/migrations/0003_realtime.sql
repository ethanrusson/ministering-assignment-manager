-- Phase 4B: Enable Supabase Realtime for all ward-scoped tables.
-- Each table is added to the supabase_realtime publication so that
-- postgres_changes events are broadcast to subscribed clients.

alter publication supabase_realtime add table public.elders;
alter publication supabase_realtime add table public.households;
alter publication supabase_realtime add table public.labels;
alter publication supabase_realtime add table public.districts;
alter publication supabase_realtime add table public.companionships;
alter publication supabase_realtime add table public.household_labels;
alter publication supabase_realtime add table public.companionship_elders;
alter publication supabase_realtime add table public.companionship_households;
