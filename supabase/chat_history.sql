-- async-apex-practice: tutor chat history per topic + checklist state
-- Table shape after the PD1 Hub migration: one row per signed-in user,
-- readable and writable only by its owner.
-- On an existing project, run pd1-hub/supabase/pd1hub_migration.sql instead;
-- this file is for reference and for setting up a fresh project. Safe to re-run.

create table if not exists public.chat_history (
  user_id    uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  id         int  not null default 1,  -- legacy, from before PD1 Hub
  history    jsonb default '{}'::jsonb,
  checked    jsonb default '{}'::jsonb
);

alter table public.chat_history enable row level security;

drop policy if exists "owner select" on public.chat_history;
drop policy if exists "owner insert" on public.chat_history;
drop policy if exists "owner update" on public.chat_history;
drop policy if exists "owner delete" on public.chat_history;

create policy "owner select" on public.chat_history for select to authenticated using (user_id = auth.uid());
create policy "owner insert" on public.chat_history for insert to authenticated with check (user_id = auth.uid());
create policy "owner update" on public.chat_history for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner delete" on public.chat_history for delete to authenticated using (user_id = auth.uid());
