-- Family seats: the first person in a family khata is free; every extra person needs a
-- ₹19 lifetime seat. Seats are only ever added by the server after a verified payment
-- (functions: revenuecat-webhook for Play Store / App Store, razorpay-webhook for the website).

alter table public.households add column if not exists seats int not null default 1 check (seats >= 1);

create table if not exists public.seat_purchases (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  bought_by uuid,                 -- auth user who paid
  provider text not null check (provider in ('play', 'apple', 'razorpay', 'test')),
  transaction_id text not null,
  amount_paise int,
  created_at timestamptz not null default now(),
  unique (provider, transaction_id)  -- the same payment can never add two seats
);
alter table public.seat_purchases enable row level security;
drop policy if exists "members read purchases" on public.seat_purchases;
create policy "members read purchases" on public.seat_purchases for select using (public.is_member(household_id));
grant select on public.seat_purchases to authenticated;

-- Called only by the payment webhooks (service role). Idempotent: a repeated webhook adds nothing.
create or replace function public.add_seat(p_household uuid, p_user uuid, p_provider text, p_txn text, p_amount int default 1900)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into seat_purchases (household_id, bought_by, provider, transaction_id, amount_paise)
    values (p_household, p_user, p_provider, p_txn, p_amount)
    on conflict (provider, transaction_id) do nothing;
  if found then update households set seats = seats + 1 where id = p_household; end if;
  select seats into n from households where id = p_household;
  return n;
end $$;
revoke all on function public.add_seat(uuid, uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.add_seat(uuid, uuid, text, text, int) to service_role;

-- Seats used / total, for the Family screen.
create or replace function public.family_seats(p_household uuid) returns table (used int, total int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from members m where m.household_id = h.id), h.seats
  from households h where h.id = p_household and public.is_member(p_household);
$$;
revoke all on function public.family_seats(uuid) from public, anon;
grant execute on function public.family_seats(uuid) to authenticated;

-- Joining now needs a free seat. Rejoining (already a member) always works.
create or replace function public.join_household(p_code text, p_name text) returns table (household_id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare hid uuid; total int; used int; c text := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id, seats into hid, total from households where households.code = c;
  if hid is null then return; end if;
  if not exists (select 1 from members where members.household_id = hid and user_id = auth.uid()) then
    -- lock the household row so two people can't take the last seat at once
    perform 1 from households where id = hid for update;
    select count(*) into used from members where members.household_id = hid;
    if used >= total then raise exception 'family-full' using errcode = 'P0001'; end if;
  end if;
  insert into members (household_id, user_id, name) values (hid, auth.uid(), left(trim(p_name), 40))
    on conflict on constraint members_pkey do update set name = excluded.name;
  return query select hid, c;
end $$;
revoke all on function public.join_household(text, text) from public, anon;
grant execute on function public.join_household(text, text) to authenticated;
