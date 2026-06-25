create or replace function public.create_initial_workspace(
  workspace_name text,
  profile_email text,
  profile_display_name text,
  profile_avatar_url text default null,
  profile_timezone text default 'UTC'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_workspace_id uuid := gen_random_uuid();
  base_slug text := lower(regexp_replace(trim(workspace_name), '[^a-zA-Z0-9]+', '-', 'g'));
  final_slug text;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to create a workspace.';
  end if;

  if trim(coalesce(workspace_name, '')) = '' then
    raise exception 'Workspace name is required.';
  end if;

  final_slug := coalesce(nullif(trim(both '-' from base_slug), ''), 'workspace') || '-' || substr(new_workspace_id::text, 1, 8);

  insert into public.users (id, email, display_name, avatar_url, timezone)
  values (
    current_user_id,
    profile_email,
    coalesce(nullif(trim(profile_display_name), ''), split_part(profile_email, '@', 1), 'Member'),
    profile_avatar_url,
    coalesce(profile_timezone, 'UTC')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    timezone = excluded.timezone,
    updated_at = now();

  insert into public.workspaces (id, name, slug, owner_id)
  values (new_workspace_id, trim(workspace_name), final_slug, current_user_id);

  insert into public.memberships (workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');

  insert into public.spaces (workspace_id, name, slug, access, created_by)
  values (new_workspace_id, 'General', 'general', 'public', current_user_id);

  return new_workspace_id;
end;
$$;

revoke all on function public.create_initial_workspace(text, text, text, text, text) from public;
revoke all on function public.create_initial_workspace(text, text, text, text, text) from anon;
grant execute on function public.create_initial_workspace(text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
