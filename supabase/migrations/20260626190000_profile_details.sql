alter table public.users
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists bio text;
