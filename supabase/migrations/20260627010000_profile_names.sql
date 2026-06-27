alter table public.users
  add column if not exists full_name text,
  add column if not exists nickname text;

update public.users
set
  full_name = coalesce(nullif(trim(full_name), ''), display_name),
  nickname = coalesce(nullif(trim(nickname), ''), display_name)
where full_name is null
   or trim(full_name) = ''
   or nickname is null
   or trim(nickname) = '';

comment on column public.users.full_name is 'Private administrative name shown to camp Chiefs and Admins.';
comment on column public.users.nickname is 'Public name shown in Tribu conversations and collaborative surfaces.';
