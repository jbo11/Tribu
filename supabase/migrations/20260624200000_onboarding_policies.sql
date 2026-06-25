create policy "Users can insert their own profile"
on public.users
for insert
with check (id = auth.uid());

create policy "Workspace peers can read profiles"
on public.users
for select
using (
  id = auth.uid()
  or exists (
    select 1
    from public.memberships viewer
    join public.memberships peer
      on peer.workspace_id = viewer.workspace_id
    where viewer.user_id = auth.uid()
      and peer.user_id = public.users.id
  )
);

create policy "Authenticated users create owned workspaces"
on public.workspaces
for insert
with check (owner_id = auth.uid());

create policy "Owners create their initial membership"
on public.memberships
for insert
with check (
  user_id = auth.uid()
  and role = 'owner'
  and exists (
    select 1
    from public.workspaces w
    where w.id = workspace_id
      and w.owner_id = auth.uid()
  )
);

create policy "Admins create spaces"
on public.spaces
for insert
with check (
  created_by = auth.uid()
  and public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
);

create policy "Admins update spaces"
on public.spaces
for update
using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));
