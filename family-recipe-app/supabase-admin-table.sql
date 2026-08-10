-- Formalizes admin access: replaces the hardcoded email in is_admin()
-- with a real `admins` table, manageable both here and from the
-- in-app Admin dashboard (Admin.tsx now reads/writes this table
-- instead of a client-side ADMIN_EMAILS array).
--
-- Safe to re-run.

create table if not exists public.admins (
  email text primary key,
  added_by text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- security definer + a fixed search_path so it can read `admins`
-- regardless of the caller's RLS, and so it's usable inside other
-- tables' policies (recipes, approval_requests) without recursion.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where email = (auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.is_admin() to authenticated;

drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins
  for select to authenticated
  using (is_admin());

drop policy if exists admins_insert on public.admins;
create policy admins_insert on public.admins
  for insert to authenticated
  with check (is_admin());

drop policy if exists admins_delete on public.admins;
create policy admins_delete on public.admins
  for delete to authenticated
  using (is_admin());

-- Seed the first admin. The SQL Editor runs as a privileged role, so
-- this insert succeeds even before any policy would otherwise allow it.
insert into public.admins (email, added_by)
values ('dylan.canoglu@gmail.com', 'seed')
on conflict (email) do nothing;
