-- FirstPass Q-Bank: one private progress snapshot per verified Supabase user.
-- Run once in the Supabase SQL Editor (not in a Codespaces terminal).
-- No question JSON is stored in this table; the built-in bank remains public app data.

create table if not exists public.user_qbank_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);

alter table public.user_qbank_state enable row level security;

-- Only logged-in accounts may use the table. Anonymous users receive no grants.
revoke all on public.user_qbank_state from public, anon;
grant select, insert, update on public.user_qbank_state to authenticated;

drop policy if exists "FirstPass users read only own progress" on public.user_qbank_state;
create policy "FirstPass users read only own progress"
  on public.user_qbank_state for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "FirstPass users create only own progress" on public.user_qbank_state;
create policy "FirstPass users create only own progress"
  on public.user_qbank_state for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "FirstPass users update only own progress" on public.user_qbank_state;
create policy "FirstPass users update only own progress"
  on public.user_qbank_state for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- There is intentionally no DELETE policy. Account deletion is managed separately.
