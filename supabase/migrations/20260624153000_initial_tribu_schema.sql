create extension if not exists "pgcrypto";
create extension if not exists "vector";

create type public.workspace_role as enum ('owner', 'admin', 'member', 'guest');
create type public.space_access as enum ('public', 'private', 'invite_only');
create type public.content_state as enum ('open', 'read_only', 'locked', 'archived');
create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'canceled');
create type public.agent_provider as enum ('openai', 'anthropic', 'gemini');
create type public.plan_tier as enum ('free', 'pro', 'business', 'enterprise');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  avatar_url text,
  timezone text default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references public.users(id),
  logo_url text,
  brand_color text default '#F97316',
  custom_domain text unique,
  plan public.plan_tier not null default 'free',
  ai_monthly_quota integer not null default 250,
  security_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  billing_access boolean not null default false,
  invited_by uuid references public.users(id),
  joined_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  access public.space_access not null default 'public',
  description text,
  archived_at timestamptz,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.space_memberships (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (space_id, user_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  author_id uuid not null references public.users(id),
  title text not null,
  body text not null,
  state public.content_state not null default 'open',
  pinned_at timestamptz,
  scheduled_for timestamptz,
  archived_at timestamptz,
  last_activity_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  author_id uuid not null references public.users(id),
  body text not null,
  is_decision boolean not null default false,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(body, ''))) stored,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  check ((post_id is not null and comment_id is null) or (post_id is null and comment_id is not null)),
  unique (post_id, comment_id, user_id, emoji)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  uploaded_by uuid not null references public.users(id),
  bucket text not null default 'workspace-files',
  object_path text not null,
  filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  handle text not null,
  provider public.agent_provider not null,
  model text not null,
  instructions text not null,
  permissions jsonb not null default '{"read": true, "reply": true, "create_tasks": true}'::jsonb,
  memory jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, handle)
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete set null,
  prompt text not null,
  response text,
  provider_request_id text,
  tokens_input integer default 0,
  tokens_output integer default 0,
  status text not null default 'queued',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete set null,
  title text not null,
  description text,
  assignee_id uuid references public.users(id),
  created_by uuid not null references public.users(id),
  status public.task_status not null default 'todo',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  post_id uuid references public.posts(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan public.plan_tier not null default 'free',
  status text not null default 'trialing',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  stripe_event_id text not null unique,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  event text not null,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index users_email_idx on public.users (email);
create index memberships_user_idx on public.memberships (user_id, workspace_id);
create index spaces_workspace_access_idx on public.spaces (workspace_id, access);
create index space_memberships_user_idx on public.space_memberships (user_id, space_id);
create index posts_workspace_activity_idx on public.posts (workspace_id, last_activity_at desc);
create index posts_space_activity_idx on public.posts (space_id, last_activity_at desc);
create index posts_search_idx on public.posts using gin (search_vector);
create index posts_embedding_idx on public.posts using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index comments_post_created_idx on public.comments (post_id, created_at);
create index comments_search_idx on public.comments using gin (search_vector);
create index comments_embedding_idx on public.comments using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index notifications_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index tasks_assignee_status_idx on public.tasks (assignee_id, status, due_at);
create index ai_messages_post_idx on public.ai_messages (post_id, created_at desc);
create index activity_workspace_created_idx on public.activity_logs (workspace_id, created_at desc);
create index audit_workspace_created_idx on public.audit_logs (workspace_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.bump_post_activity()
returns trigger
language plpgsql
as $$
begin
  update public.posts
  set last_activity_at = now(), updated_at = now()
  where id = new.post_id;
  return new;
end;
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles public.workspace_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

create or replace function public.can_access_space(target_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.spaces s
    left join public.space_memberships sm
      on sm.space_id = s.id and sm.user_id = auth.uid()
    join public.memberships m
      on m.workspace_id = s.workspace_id and m.user_id = auth.uid()
    where s.id = target_space_id
      and (
        s.access = 'public'
        or sm.id is not null
        or m.role in ('owner', 'admin')
      )
  );
$$;

create trigger touch_users_updated_at before update on public.users for each row execute function public.touch_updated_at();
create trigger touch_workspaces_updated_at before update on public.workspaces for each row execute function public.touch_updated_at();
create trigger touch_spaces_updated_at before update on public.spaces for each row execute function public.touch_updated_at();
create trigger touch_posts_updated_at before update on public.posts for each row execute function public.touch_updated_at();
create trigger touch_comments_updated_at before update on public.comments for each row execute function public.touch_updated_at();
create trigger touch_agents_updated_at before update on public.ai_agents for each row execute function public.touch_updated_at();
create trigger touch_tasks_updated_at before update on public.tasks for each row execute function public.touch_updated_at();
create trigger bump_post_on_comment after insert on public.comments for each row execute function public.bump_post_activity();

alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.spaces enable row level security;
alter table public.space_memberships enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.attachments enable row level security;
alter table public.ai_agents enable row level security;
alter table public.ai_messages enable row level security;
alter table public.tasks enable row level security;
alter table public.notifications enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.activity_logs enable row level security;
alter table public.audit_logs enable row level security;

create policy "Users can read their own profile" on public.users for select using (id = auth.uid());
create policy "Users can update their own profile" on public.users for update using (id = auth.uid());

create policy "Members can read workspace" on public.workspaces for select using (public.is_workspace_member(id));
create policy "Owners can update workspace" on public.workspaces for update using (public.has_workspace_role(id, array['owner', 'admin']::public.workspace_role[]));

create policy "Members can read memberships" on public.memberships for select using (public.is_workspace_member(workspace_id));
create policy "Admins manage memberships" on public.memberships for all using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy "Members can read visible spaces" on public.spaces for select using (public.can_access_space(id));
create policy "Admins manage spaces" on public.spaces for all using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy "Members can read space members" on public.space_memberships for select using (public.can_access_space(space_id));
create policy "Admins manage space members" on public.space_memberships for all using (
  exists (
    select 1 from public.spaces s
    where s.id = space_id
      and public.has_workspace_role(s.workspace_id, array['owner', 'admin']::public.workspace_role[])
  )
);

create policy "Members can read accessible posts" on public.posts for select using (public.can_access_space(space_id));
create policy "Members create posts" on public.posts for insert with check (public.can_access_space(space_id) and author_id = auth.uid());
create policy "Authors and admins update posts" on public.posts for update using (
  author_id = auth.uid() or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
);

create policy "Members can read comments" on public.comments for select using (
  exists (select 1 from public.posts p where p.id = post_id and public.can_access_space(p.space_id))
);
create policy "Members create comments" on public.comments for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.posts p
    where p.id = post_id
      and p.state = 'open'
      and public.can_access_space(p.space_id)
  )
);
create policy "Authors and admins update comments" on public.comments for update using (
  author_id = auth.uid() or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
);

create policy "Members can manage reactions" on public.reactions for all using (public.is_workspace_member(workspace_id)) with check (user_id = auth.uid());
create policy "Members can read attachments" on public.attachments for select using (public.is_workspace_member(workspace_id));
create policy "Members upload attachments" on public.attachments for insert with check (uploaded_by = auth.uid() and public.is_workspace_member(workspace_id));

create policy "Members can read agents" on public.ai_agents for select using (public.is_workspace_member(workspace_id));
create policy "Admins manage agents" on public.ai_agents for all using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));
create policy "Members can read ai messages" on public.ai_messages for select using (public.is_workspace_member(workspace_id));
create policy "Members can create ai messages" on public.ai_messages for insert with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));

create policy "Members can read tasks" on public.tasks for select using (public.is_workspace_member(workspace_id));
create policy "Members create tasks" on public.tasks for insert with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));
create policy "Assignees creators admins update tasks" on public.tasks for update using (
  assignee_id = auth.uid()
  or created_by = auth.uid()
  or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
);

create policy "Users read own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "Users update own notifications" on public.notifications for update using (user_id = auth.uid());

create policy "Admins read subscriptions" on public.subscriptions for select using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));
create policy "Owners manage subscriptions" on public.subscriptions for all using (public.has_workspace_role(workspace_id, array['owner']::public.workspace_role[]));
create policy "Admins read billing events" on public.billing_events for select using (workspace_id is not null and public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));
create policy "Members read activity logs" on public.activity_logs for select using (public.is_workspace_member(workspace_id));
create policy "Admins read audit logs" on public.audit_logs for select using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));
