-- Run this once in the Supabase SQL editor for the Daily Planner project.
create extension if not exists pgcrypto;

create table if not exists public.planner_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Shared Planner',
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.planner_workspace_members (
  workspace_id uuid not null references public.planner_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.planner_days (
  workspace_id uuid not null references public.planner_workspaces(id) on delete cascade,
  profile_id text not null check (profile_id in ('trent', 'diane', 'joint')),
  plan_date date not null,
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  primary key (workspace_id, profile_id, plan_date)
);

create table if not exists public.planner_action_banks (
  workspace_id uuid not null references public.planner_workspaces(id) on delete cascade,
  profile_id text not null check (profile_id in ('trent', 'diane', 'joint')),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  primary key (workspace_id, profile_id)
);

create or replace function public.is_planner_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.planner_workspace_members where workspace_id = target_workspace and user_id = auth.uid()) $$;

create or replace function public.create_planner_workspace(workspace_name text default 'Trent & Diane Planner')
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_workspace uuid; new_code text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if exists(select 1 from public.planner_workspace_members where user_id = auth.uid()) then
    select workspace_id into new_workspace from public.planner_workspace_members where user_id = auth.uid() limit 1;
    return new_workspace;
  end if;
  loop
    new_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists(select 1 from public.planner_workspaces where join_code = new_code);
  end loop;
  insert into public.planner_workspaces(name, join_code) values (coalesce(nullif(trim(workspace_name), ''), 'Shared Planner'), new_code) returning id into new_workspace;
  insert into public.planner_workspace_members(workspace_id, user_id) values (new_workspace, auth.uid());
  return new_workspace;
end $$;

create or replace function public.join_planner_workspace(invite_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_workspace uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select id into target_workspace from public.planner_workspaces where join_code = upper(regexp_replace(invite_code, '[^a-zA-Z0-9]', '', 'g'));
  if target_workspace is null then return null; end if;
  insert into public.planner_workspace_members(workspace_id, user_id) values (target_workspace, auth.uid()) on conflict do nothing;
  return target_workspace;
end $$;

alter table public.planner_workspaces enable row level security;
alter table public.planner_workspace_members enable row level security;
alter table public.planner_days enable row level security;
alter table public.planner_action_banks enable row level security;

drop policy if exists "Members read workspaces" on public.planner_workspaces;
create policy "Members read workspaces" on public.planner_workspaces for select to authenticated using (public.is_planner_member(id));
drop policy if exists "Members read memberships" on public.planner_workspace_members;
create policy "Members read memberships" on public.planner_workspace_members for select to authenticated using (user_id = auth.uid());
drop policy if exists "Members read days" on public.planner_days;
create policy "Members read days" on public.planner_days for select to authenticated using (public.is_planner_member(workspace_id));
drop policy if exists "Members add days" on public.planner_days;
create policy "Members add days" on public.planner_days for insert to authenticated with check (public.is_planner_member(workspace_id));
drop policy if exists "Members update days" on public.planner_days;
create policy "Members update days" on public.planner_days for update to authenticated using (public.is_planner_member(workspace_id)) with check (public.is_planner_member(workspace_id));
drop policy if exists "Members read action banks" on public.planner_action_banks;
create policy "Members read action banks" on public.planner_action_banks for select to authenticated using (public.is_planner_member(workspace_id));
drop policy if exists "Members add action banks" on public.planner_action_banks;
create policy "Members add action banks" on public.planner_action_banks for insert to authenticated with check (public.is_planner_member(workspace_id));
drop policy if exists "Members update action banks" on public.planner_action_banks;
create policy "Members update action banks" on public.planner_action_banks for update to authenticated using (public.is_planner_member(workspace_id)) with check (public.is_planner_member(workspace_id));

grant execute on function public.create_planner_workspace(text) to authenticated;
grant execute on function public.join_planner_workspace(text) to authenticated;
grant execute on function public.is_planner_member(uuid) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planner_days') then
    alter publication supabase_realtime add table public.planner_days;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planner_action_banks') then
    alter publication supabase_realtime add table public.planner_action_banks;
  end if;
end $$;
