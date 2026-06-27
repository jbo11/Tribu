alter table public.tasks
add column if not exists project_name text,
add column if not exists priority text not null default 'medium',
add column if not exists tags text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_priority_check' and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
    add constraint tasks_priority_check check (priority in ('low', 'medium', 'high', 'urgent'));
  end if;
end $$;

create index if not exists tasks_workspace_project_idx
on public.tasks (workspace_id, project_name, status, due_at);
