do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'posts'
      and policyname = 'Authors and admins delete posts'
  ) then
    create policy "Authors and admins delete posts"
    on public.posts
    for delete
    using (
      author_id = auth.uid()
      or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tasks'
      and policyname = 'Assignees creators admins delete tasks'
  ) then
    create policy "Assignees creators admins delete tasks"
    on public.tasks
    for delete
    using (
      assignee_id = auth.uid()
      or created_by = auth.uid()
      or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
    );
  end if;
end $$;
