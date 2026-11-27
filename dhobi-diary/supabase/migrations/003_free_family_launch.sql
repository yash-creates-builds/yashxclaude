-- Launch setting (v1.0): every family gets 5 free places while in-app payments aren't live yet.
-- Families keep these places later. To switch paid seats on (v1.1), run:
--   alter table public.households alter column seats set default 1;
alter table public.households alter column seats set default 5;
update public.households set seats = 5 where seats < 5;
