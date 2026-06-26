alter table public.comments
drop constraint if exists comments_parent_comment_id_fkey;

alter table public.comments
add constraint comments_parent_comment_id_fkey
foreign key (parent_comment_id) references public.comments(id) on delete set null;

drop policy if exists "Members can manage reactions" on public.reactions;
drop policy if exists "Members can read reactions" on public.reactions;
drop policy if exists "Members create their own reactions" on public.reactions;
drop policy if exists "Members delete their own reactions" on public.reactions;

create policy "Members can read reactions"
on public.reactions for select
using (public.is_workspace_member(workspace_id));

create policy "Members create their own reactions"
on public.reactions for insert
with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create policy "Members delete their own reactions"
on public.reactions for delete
using (user_id = auth.uid() and public.is_workspace_member(workspace_id));

drop policy if exists "Authors and admins delete comments" on public.comments;
create policy "Authors and admins delete comments"
on public.comments for delete
using (
  author_id = auth.uid()
  or public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
);

create unique index if not exists reactions_post_user_emoji_unique
on public.reactions (post_id, user_id, emoji)
where comment_id is null;

create unique index if not exists reactions_comment_user_emoji_unique
on public.reactions (comment_id, user_id, emoji)
where comment_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reactions'
  ) then
    alter publication supabase_realtime add table public.reactions;
  end if;
end $$;
