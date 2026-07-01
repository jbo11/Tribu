-- Keep user-facing database messages aligned with the TriCord product language.

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

create or replace function public.archive_completed_task(target_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_task public.tasks%rowtype;
begin
  select * into target_task from public.tasks where id = target_task_id;
  if target_task.id is null then raise exception 'Task not found.'; end if;
  if auth.uid() is null or not public.is_workspace_member(target_task.workspace_id) then
    raise exception 'Hub access required.';
  end if;
  if target_task.status not in ('done', 'canceled') then
    raise exception 'Only completed or canceled tasks can be archived.';
  end if;
  update public.tasks set archived_at = now() where id = target_task_id;
end;
$$;

create or replace function public.update_member_role(target_membership_id uuid, new_role public.workspace_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_membership public.memberships%rowtype;
begin
  select * into target_membership from public.memberships where id = target_membership_id;
  if target_membership.id is null then raise exception 'Membership not found.'; end if;
  if not public.has_workspace_role(target_membership.workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'Admin access required.';
  end if;
  if target_membership.role = 'owner' or new_role = 'owner' then
    raise exception 'The Owner role cannot be changed here.';
  end if;
  update public.memberships set role = new_role where id = target_membership_id;
end;
$$;

comment on column public.users.full_name is 'Private administrative name shown to hub Owners and Admins.';
comment on column public.users.nickname is 'Public name shown in TriCord conversations and collaborative surfaces.';
