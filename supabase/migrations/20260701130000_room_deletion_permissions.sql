drop policy if exists "Members delete rooms they created" on public.spaces;

create policy "Members delete rooms they created"
on public.spaces
for delete
using (
  created_by = auth.uid()
  and public.has_workspace_role(
    workspace_id,
    array['member']::public.workspace_role[]
  )
);
