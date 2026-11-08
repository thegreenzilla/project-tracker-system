-- Mober Project Tracker — database schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run: drops nothing, creates what is missing.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Who may use the app: anyone signed in with a company email.
-- Add more domains here if needed (e.g. 'greenzilla.ph').
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_staff()
returns boolean language sql stable as $$
  select coalesce(split_part(lower(auth.jwt() ->> 'email'), '@', 2) in ('mober.ph'), false)
$$;

-- ─────────────────────────────────────────────────────────────
-- People
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  title       text not null default '',
  role        text not null default 'member' check (role in ('admin','member')),
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- New sign-in → profile row. The first person to sign in becomes admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'member' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Projects
-- ─────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null default '',          -- short tag, e.g. ORD
  goal        text not null default '',          -- one-line outcome
  description text not null default '',
  owner_id    uuid references public.profiles(id) on delete set null,
  sponsor_id  uuid references public.profiles(id) on delete set null,
  status      text not null default 'active' check (status in ('planning','active','on_hold','done')),
  health      text not null default 'green'  check (health in ('green','amber','red')),
  start_date  date,
  end_date    date,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'editor' check (role in ('editor','viewer')),
  primary key (project_id, profile_id)
);

-- Can the signed-in person change this project's tasks and reviews?
create or replace function public.can_edit_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.projects p where p.id = pid
                 and auth.uid() in (p.owner_id, p.sponsor_id, p.created_by))
      or exists (select 1 from public.project_members m where m.project_id = pid
                 and m.profile_id = auth.uid() and m.role = 'editor')
$$;

-- Can the signed-in person change the project's details and members?
create or replace function public.can_manage_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.projects p where p.id = pid
                 and auth.uid() in (p.owner_id, p.sponsor_id, p.created_by))
$$;

-- ─────────────────────────────────────────────────────────────
-- Tasks
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  workstream  text not null default '',
  partner     text not null default '',          -- who they work with (free text)
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date    date not null,
  status      text not null default 'todo' check (status in ('todo','doing','blocked','done')),
  kind        text not null default 'task' check (kind in ('task','output','milestone','review')),
  note        text not null default '',
  sort        int  not null default 0,
  done_at     timestamptz,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tasks_project_due on public.tasks (project_id, due_date);

-- ─────────────────────────────────────────────────────────────
-- Weekly reviews (one per project per week)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  week_of     date not null,                     -- the Monday of the week
  health      text not null default 'green' check (health in ('green','amber','red')),
  summary     text not null default '',
  wins        text not null default '',
  issues      text not null default '',
  decisions   text not null default '',
  next_steps  text not null default '',
  author_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, week_of)
);

-- ─────────────────────────────────────────────────────────────
-- Housekeeping triggers
-- ─────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.stamp_done_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.done_at = now();
  elsif new.status <> 'done' then
    new.done_at = null;
  end if;
  return new;
end $$;

-- A review's health becomes the project's health.
create or replace function public.review_sets_health()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.projects set health = new.health
  where id = new.project_id
    and not exists (select 1 from public.reviews r
                    where r.project_id = new.project_id and r.week_of > new.week_of);
  return new;
end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
drop trigger if exists tasks_done on public.tasks;
create trigger tasks_done before insert or update of status on public.tasks for each row execute function public.stamp_done_at();
drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before update on public.reviews for each row execute function public.touch_updated_at();
drop trigger if exists reviews_health on public.reviews;
create trigger reviews_health after insert or update of health on public.reviews for each row execute function public.review_sets_health();

-- ─────────────────────────────────────────────────────────────
-- Access rules (Row Level Security)
-- Everyone with a company email can see everything.
-- Only the people on a project can change it.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks           enable row level security;
alter table public.reviews         enable row level security;

drop policy if exists "staff read profiles" on public.profiles;
create policy "staff read profiles" on public.profiles for select using (public.is_staff());
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (id = auth.uid() and role = (select role from public.profiles where id = auth.uid())));

drop policy if exists "staff read projects" on public.projects;
create policy "staff read projects" on public.projects for select using (public.is_staff());
drop policy if exists "staff create projects" on public.projects;
create policy "staff create projects" on public.projects for insert with check (public.is_staff());
drop policy if exists "managers edit projects" on public.projects;
create policy "managers edit projects" on public.projects for update using (public.can_manage_project(id));
drop policy if exists "admins delete projects" on public.projects;
create policy "admins delete projects" on public.projects for delete using (public.is_admin());

drop policy if exists "staff read members" on public.project_members;
create policy "staff read members" on public.project_members for select using (public.is_staff());
drop policy if exists "managers edit members" on public.project_members;
create policy "managers edit members" on public.project_members for all
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));

drop policy if exists "staff read tasks" on public.tasks;
create policy "staff read tasks" on public.tasks for select using (public.is_staff());
drop policy if exists "editors write tasks" on public.tasks;
create policy "editors write tasks" on public.tasks for all
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

drop policy if exists "staff read reviews" on public.reviews;
create policy "staff read reviews" on public.reviews for select using (public.is_staff());
drop policy if exists "editors write reviews" on public.reviews;
create policy "editors write reviews" on public.reviews for all
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

-- Live updates in the app
do $$ begin
  alter publication supabase_realtime add table public.tasks, public.reviews, public.projects;
exception when others then null; end $$;
