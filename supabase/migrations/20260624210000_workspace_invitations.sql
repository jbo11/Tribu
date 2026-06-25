create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'member',
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references public.users(id),
  accepted_by uuid references public.users(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  check (role in ('admin', 'member', 'guest'))
);

create index if not exists workspace_invitations_workspace_idx
on public.workspace_invitations (workspace_id, created_at desc);

create index if not exists workspace_invitations_token_idx
on public.workspace_invitations (token)
where accepted_at is null;

alter table public.workspace_invitations enable row level security;

create policy "Admins read workspace invitations"
on public.workspace_invitations
for select
using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create or replace function public.create_workspace_invitation(
  target_workspace_id uuid,
  invitee_email text,
  invitee_role public.workspace_role default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(invitee_email));
  invite_token uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to invite members.';
  end if;

  if not public.has_workspace_role(target_workspace_id, array['owner', 'admin']::public.workspace_role[]) then
    raise exception 'You do not have permission to invite members.';
  end if;

  if normalized_email = '' then
    raise exception 'Invite email is required.';
  end if;

  if invitee_role = 'owner' then
    raise exception 'Owner role cannot be assigned by invite.';
  end if;

  insert into public.workspace_invitations (workspace_id, email, role, invited_by)
  values (target_workspace_id, normalized_email, invitee_role, auth.uid())
  returning token into invite_token;

  return invite_token;
end;
$$;

create or replace function public.accept_workspace_invitation(
  invite_token text,
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
  normalized_email text := lower(trim(profile_email));
  invitation public.workspace_invitations%rowtype;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to accept this invite.';
  end if;

  select *
  into invitation
  from public.workspace_invitations
  where token = invite_token::uuid
    and accepted_at is null
    and expires_at > now()
  limit 1;

  if invitation.id is null then
    raise exception 'This invite is invalid, expired, or already accepted.';
  end if;

  if invitation.email <> normalized_email then
    raise exception 'This invite was sent to a different email address.';
  end if;

  insert into public.users (id, email, display_name, avatar_url, timezone)
  values (
    current_user_id,
    normalized_email,
    coalesce(nullif(trim(profile_display_name), ''), split_part(normalized_email, '@', 1), 'Member'),
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

  insert into public.memberships (workspace_id, user_id, role)
  values (invitation.workspace_id, current_user_id, invitation.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations
  set accepted_by = current_user_id,
      accepted_at = now()
  where id = invitation.id;

  return invitation.workspace_id;
end;
$$;

revoke all on function public.create_workspace_invitation(uuid, text, public.workspace_role) from public;
revoke all on function public.create_workspace_invitation(uuid, text, public.workspace_role) from anon;
grant execute on function public.create_workspace_invitation(uuid, text, public.workspace_role) to authenticated;

revoke all on function public.accept_workspace_invitation(text, text, text, text, text) from public;
revoke all on function public.accept_workspace_invitation(text, text, text, text, text) from anon;
grant execute on function public.accept_workspace_invitation(text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
