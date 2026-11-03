-- public.profiles: app user data, 1:1 with auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile for each auth user. Created automatically on signup.';

alter table public.profiles enable row level security;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (
    id,
    "supabaseId",
    email,
    "phoneE164",
    "displayName",
    "preferredLanguage",
    "onboardingCompleted",
    "onboardingStep"
  )
  values (
    new.id,
    new.id::text,
    nullif(trim(new.email), ''),
    nullif(trim(new.phone), ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'displayName'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(new.email, '@', 1), '')
    ),
    coalesce(new.raw_user_meta_data ->> 'preferredLanguage', 'en'),
    false,
    'language'
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.users.email),
        "phoneE164" = coalesce(excluded."phoneE164", public.users."phoneE164"),
        "supabaseId" = excluded."supabaseId",
        "updatedAt" = now();

  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'displayName',
          new.raw_user_meta_data ->> 'name'
        )
      ),
      ''
    ),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;
revoke all on function public.set_profiles_updated_at() from public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

insert into public.profiles (id, username, full_name, avatar_url)
select
  u.id,
  nullif(trim(u.raw_user_meta_data ->> 'username'), ''),
  nullif(
    trim(
      coalesce(
        u.raw_user_meta_data ->> 'full_name',
        u.raw_user_meta_data ->> 'displayName',
        u.raw_user_meta_data ->> 'name'
      )
    ),
    ''
  ),
  nullif(trim(u.raw_user_meta_data ->> 'avatar_url'), '')
from auth.users u
on conflict (id) do nothing;
