insert into storage.buckets (id, name, public, file_size_limit)
values
  ('avatars', 'avatars', true, 10485760),
  ('workspace-files', 'workspace-files', false, 104857600)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Authors and admins delete posts" on public.posts;
create policy "Authors and admins delete posts"
on public.posts for delete
using (
  author_id = auth.uid()
  or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
);

drop policy if exists "Assignees creators admins delete tasks" on public.tasks;
create policy "Assignees creators admins delete tasks"
on public.tasks for delete
using (
  assignee_id = auth.uid()
  or created_by = auth.uid()
  or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Anyone reads avatars'
  ) then
    create policy "Anyone reads avatars"
    on storage.objects for select
    using (bucket_id = 'avatars');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users upload their own avatars'
  ) then
    create policy "Users upload their own avatars"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users update their own avatars'
  ) then
    create policy "Users update their own avatars"
    on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users delete their own avatars'
  ) then
    create policy "Users delete their own avatars"
    on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Members read camp files'
  ) then
    create policy "Members read camp files"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'workspace-files'
      and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Members upload camp files'
  ) then
    create policy "Members upload camp files"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'workspace-files'
      and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
      and (storage.foldername(name))[2] = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Uploaders and admins delete camp files'
  ) then
    create policy "Uploaders and admins delete camp files"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'workspace-files'
      and (
        (storage.foldername(name))[2] = auth.uid()::text
        or public.has_workspace_role(
          ((storage.foldername(name))[1])::uuid,
          array['owner', 'admin']::public.workspace_role[]
        )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attachments' and policyname = 'Uploaders and admins delete attachments'
  ) then
    create policy "Uploaders and admins delete attachments"
    on public.attachments for delete
    using (
      uploaded_by = auth.uid()
      or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attachments'
  ) then
    alter publication supabase_realtime add table public.attachments;
  end if;
end $$;
