-- Dhobi Diary: family diary sync on Supabase.
-- Run once: Supabase dashboard → SQL Editor → paste this file → Run.
-- Also turn on: Authentication → Sign In / Providers → "Allow anonymous sign-ins".

-- One household = one family diary. `code` is what family members type to join.
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  name text not null check (char_length(name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Everything in the diary, one row per bundle / visit / shared setting.
-- kind: 'batches' | 'visits' | 'shared' (id = rates | paid | customItems | dhobis)
-- Deletes are soft (deleted = true) so other phones hear about them.
create table if not exists public.entries (
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('batches', 'visits', 'shared')),
  id text not null check (char_length(id) <= 64),
  data jsonb,
  deleted boolean not null default false,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (household_id, kind, id)
);
create index if not exists entries_household_updated on public.entries (household_id, updated_at);

create or replace function public.touch_entry() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before insert or update on public.entries for each row execute function public.touch_entry();

-- Is the signed-in phone part of this household? (security definer avoids RLS recursion)
create or replace function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where household_id = hid and user_id = auth.uid());
$$;

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.entries enable row level security;

drop policy if exists "members read household" on public.households;
create policy "members read household" on public.households for select using (public.is_member(id));

drop policy if exists "members read members" on public.members;
create policy "members read members" on public.members for select using (public.is_member(household_id));
drop policy if exists "rename yourself" on public.members;
create policy "rename yourself" on public.members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "leave" on public.members;
create policy "leave" on public.members for delete using (user_id = auth.uid());

drop policy if exists "members read entries" on public.entries;
create policy "members read entries" on public.entries for select using (public.is_member(household_id));
drop policy if exists "members add entries" on public.entries;
create policy "members add entries" on public.entries for insert with check (public.is_member(household_id));
drop policy if exists "members change entries" on public.entries;
create policy "members change entries" on public.entries for update using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Start a family diary: makes a unique 6-letter code and adds you as the first member.
create or replace function public.create_household(p_name text) returns table (household_id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text; hid uuid; i int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    begin
      insert into households (code, created_by) values (c, auth.uid()) returning id into hid;
      exit;
    exception when unique_violation then -- code taken, try another
    end;
  end loop;
  insert into members (household_id, user_id, name) values (hid, auth.uid(), left(trim(p_name), 40));
  return query select hid, c;
end $$;

-- Join with a code. Wrong codes return no row. Joining twice just updates your name.
create or replace function public.join_household(p_code text, p_name text) returns table (household_id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare hid uuid; c text := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into hid from households where households.code = c;
  if hid is null then return; end if;
  insert into members (household_id, user_id, name) values (hid, auth.uid(), left(trim(p_name), 40))
    on conflict on constraint members_pkey do update set name = excluded.name;
  return query select hid, c;
end $$;

revoke all on function public.create_household(text) from public, anon;
revoke all on function public.join_household(text, text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
grant select, insert, update on public.entries to authenticated;
grant select, update, delete on public.members to authenticated;
grant select on public.households to authenticated;

-- Live updates between phones.
do $$ begin
  alter publication supabase_realtime add table public.entries;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.members;
exception when others then null; end $$;
