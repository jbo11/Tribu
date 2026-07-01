create table if not exists public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category text not null check (category in ('documentation', 'how_to', 'faq', 'best_practice', 'troubleshooting', 'sop')),
  title text not null,
  summary text,
  content text not null,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_articles_workspace_category_idx
on public.knowledge_articles (workspace_id, category, updated_at desc);

alter table public.knowledge_articles enable row level security;

drop trigger if exists touch_knowledge_articles_updated_at on public.knowledge_articles;
create trigger touch_knowledge_articles_updated_at
before update on public.knowledge_articles
for each row execute function public.touch_updated_at();

drop policy if exists "Members read knowledge articles" on public.knowledge_articles;
create policy "Members read knowledge articles"
on public.knowledge_articles for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "Members create knowledge articles" on public.knowledge_articles;
create policy "Members create knowledge articles"
on public.knowledge_articles for insert
with check (created_by = auth.uid() and public.is_workspace_member(workspace_id));

drop policy if exists "Admins update knowledge articles" on public.knowledge_articles;
create policy "Admins update knowledge articles"
on public.knowledge_articles for update
using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

drop policy if exists "Admins delete knowledge articles" on public.knowledge_articles;
create policy "Admins delete knowledge articles"
on public.knowledge_articles for delete
using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

alter table public.tasks add column if not exists archived_at timestamptz;

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

revoke all on function public.archive_completed_task(uuid) from public;
grant execute on function public.archive_completed_task(uuid) to authenticated;

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

revoke all on function public.update_member_role(uuid, public.workspace_role) from public;
grant execute on function public.update_member_role(uuid, public.workspace_role) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'knowledge_articles'
  ) then
    alter publication supabase_realtime add table public.knowledge_articles;
  end if;
end $$;
