create or replace function public.assign_post(target_post_id uuid, target_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
begin
  select * into target_post from public.posts where id = target_post_id;
  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if auth.uid() is null or not public.can_access_space(target_post.space_id) then
    raise exception 'You do not have access to this post.';
  end if;

  if target_user_id is not null and not exists (
    select 1 from public.memberships
    where workspace_id = target_post.workspace_id and user_id = target_user_id
  ) then
    raise exception 'The selected assignee is not a member of this hub.';
  end if;

  update public.posts
  set metadata = case
        when target_user_id is null then metadata - 'assigned_to'
        else jsonb_set(metadata, '{assigned_to}', to_jsonb(target_user_id::text), true)
      end,
      last_activity_at = now()
  where id = target_post_id;
end;
$$;

create or replace function public.set_post_archived(target_post_id uuid, should_archive boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post public.posts%rowtype;
  restored_state public.content_state;
begin
  select * into target_post from public.posts where id = target_post_id;
  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if auth.uid() is null or not public.can_access_space(target_post.space_id) then
    raise exception 'You do not have access to this post.';
  end if;

  if should_archive and target_post.state <> 'archived' then
    update public.posts
    set state = 'archived',
        archived_at = now(),
        metadata = jsonb_set(metadata, '{state_before_archive}', to_jsonb(target_post.state::text), true),
        last_activity_at = now()
    where id = target_post_id;
  elsif not should_archive and target_post.state = 'archived' then
    restored_state := case target_post.metadata->>'state_before_archive'
      when 'read_only' then 'read_only'::public.content_state
      when 'locked' then 'locked'::public.content_state
      else 'open'::public.content_state
    end;

    update public.posts
    set state = restored_state,
        archived_at = null,
        metadata = metadata - 'state_before_archive',
        last_activity_at = now()
    where id = target_post_id;
  end if;
end;
$$;

revoke all on function public.assign_post(uuid, uuid) from public;
grant execute on function public.assign_post(uuid, uuid) to authenticated;
revoke all on function public.set_post_archived(uuid, boolean) from public;
grant execute on function public.set_post_archived(uuid, boolean) to authenticated;

create table if not exists public.link_previews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url text not null,
  title text not null,
  description text,
  image_url text,
  site_name text not null,
  fetched_at timestamptz not null default now(),
  unique (workspace_id, url)
);

alter table public.link_previews enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'link_previews' and policyname = 'Members read hub link previews'
  ) then
    create policy "Members read hub link previews"
    on public.link_previews for select
    using (public.is_workspace_member(workspace_id));
  end if;
end $$;
