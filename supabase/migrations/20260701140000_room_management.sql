create table if not exists public.room_preferences (
  user_id uuid not null references public.users(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  position integer not null default 0,
  pinned boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, space_id)
);

create index if not exists room_preferences_user_position_idx
on public.room_preferences (user_id, pinned desc, position);

alter table public.room_preferences enable row level security;

drop policy if exists "Users read their room preferences" on public.room_preferences;
create policy "Users read their room preferences"
on public.room_preferences for select
using (user_id = auth.uid());

drop policy if exists "Users create their room preferences" on public.room_preferences;
create policy "Users create their room preferences"
on public.room_preferences for insert
with check (user_id = auth.uid() and public.can_access_space(space_id));

drop policy if exists "Users update their room preferences" on public.room_preferences;
create policy "Users update their room preferences"
on public.room_preferences for update
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.can_access_space(space_id));

drop policy if exists "Users delete their room preferences" on public.room_preferences;
create policy "Users delete their room preferences"
on public.room_preferences for delete
using (user_id = auth.uid());

create or replace function public.rename_room(target_space_id uuid, new_name text, new_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.spaces%rowtype;
  can_manage boolean;
begin
  select * into target_room from public.spaces where id = target_space_id;
  if target_room.id is null then raise exception 'Room not found.'; end if;

  can_manage := public.has_workspace_role(
    target_room.workspace_id,
    array['owner', 'admin']::public.workspace_role[]
  ) or (
    target_room.created_by = auth.uid()
    and public.has_workspace_role(
      target_room.workspace_id,
      array['member']::public.workspace_role[]
    )
  );

  if not can_manage then raise exception 'You do not have permission to rename this room.'; end if;
  if nullif(trim(new_name), '') is null then raise exception 'Room name is required.'; end if;

  update public.spaces
  set name = trim(new_name), slug = new_slug
  where id = target_space_id;
end;
$$;

revoke all on function public.rename_room(uuid, text, text) from public;
grant execute on function public.rename_room(uuid, text, text) to authenticated;
