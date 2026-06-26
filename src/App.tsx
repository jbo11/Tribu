import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  File as FileIcon,
  FileText,
  Inbox,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Moon,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { type Session } from '@supabase/supabase-js';
import tribuLogoUrl from './assets/tribu-logo.png';
import { cn, formatTimeAgo } from './lib/utils';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import {
  AppComment,
  AppAttachment,
  AppPost,
  AppProfile,
  AppSpace,
  AppTask,
  AppWorkspace,
  SpaceAccess,
  SortMode,
  TaskStatus,
  ViewMode,
  WorkspaceRole,
} from './types';

const sortOptions: { value: SortMode; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'newest', label: 'Newest' },
  { value: 'decisions', label: 'Decisions' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'archived', label: 'Archived' },
];

const workspaceRoles: { role: WorkspaceRole; detail: string }[] = [
  { role: 'owner', detail: 'Camp ownership, billing, security, and deletion.' },
  { role: 'admin', detail: 'Members, trails, integrations, policies, and audit visibility.' },
  { role: 'member', detail: 'Posts, replies, files, tasks, and camp search.' },
  { role: 'guest', detail: 'Only invited trails and assigned work.' },
];

const INVITE_STORAGE_KEY = 'tribu_invite_token';
const BASIC_PROFILE_SELECT = 'id, email, display_name, avatar_url, timezone';
const PROFILE_SELECT = 'id, email, display_name, avatar_url, timezone, phone, address, bio';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<ViewMode>('feed');
  const [sort, setSort] = useState<SortMode>('active');
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<AppWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [spaces, setSpaces] = useState<AppSpace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState('all');
  const [posts, setPosts] = useState<AppPost[]>([]);
  const [comments, setComments] = useState<AppComment[]>([]);
  const [attachments, setAttachments] = useState<AppAttachment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, AppProfile>>({});
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<AppPost | null>(null);
  const [editingTask, setEditingTask] = useState<AppTask | null>(null);
  const [inviteToken, setInviteToken] = useState(getInitialInviteToken);
  const [inviteAcceptError, setInviteAcceptError] = useState('');

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const currentRole = selectedWorkspace?.role;
  const canManageAdmin = currentRole === 'owner' || currentRole === 'admin';
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? posts[0];
  const selectedProfile = selectedPost ? profiles[selectedPost.author_id] : undefined;
  const currentProfile = session?.user.id ? profiles[session.user.id] : undefined;
  const memberProfiles = useMemo(
    () => (Object.values(profiles) as AppProfile[]).sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [profiles],
  );

  const visiblePosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const base = posts.filter((post) => {
      if (sort === 'archived') return post.state === 'archived';
      if (post.state === 'archived') return false;
      return true;
    });

    const searched = normalizedQuery
      ? base.filter((post) => `${post.title} ${post.body}`.toLowerCase().includes(normalizedQuery))
      : base;

    return [...searched].sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === 'decisions') return Number(b.has_decision) - Number(a.has_decision);
      if (sort === 'assigned') return Number(Boolean(b.metadata?.assigned_to)) - Number(Boolean(a.metadata?.assigned_to));
      return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
    });
  }, [posts, query, sort]);

  const loadWorkspaceData = useCallback(async (targetWorkspaceId: string, silent = false) => {
    if (!supabase || !targetWorkspaceId) return;
    if (!silent) setLoading(true);
    setNotice('');

    const [spaceResult, postResult, taskResult, membershipResult, decisionResult] = await Promise.all([
      supabase
        .from('spaces')
        .select('id, workspace_id, name, slug, access, description, archived_at, created_by, created_at, updated_at')
        .eq('workspace_id', targetWorkspaceId)
        .is('archived_at', null)
        .order('name', { ascending: true }),
      supabase
        .from('posts')
        .select('id, workspace_id, space_id, author_id, title, body, state, pinned_at, archived_at, last_activity_at, metadata, created_at, updated_at')
        .eq('workspace_id', targetWorkspaceId)
        .order('last_activity_at', { ascending: false })
        .limit(80),
      supabase
        .from('tasks')
        .select('id, workspace_id, post_id, title, description, assignee_id, created_by, status, due_at, created_at, updated_at')
        .eq('workspace_id', targetWorkspaceId)
        .neq('status', 'canceled')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('memberships')
        .select('user_id')
        .eq('workspace_id', targetWorkspaceId),
      supabase
        .from('comments')
        .select('post_id')
        .eq('workspace_id', targetWorkspaceId)
        .eq('is_decision', true),
    ]);

    if (spaceResult.error) setNotice(spaceResult.error.message);
    if (postResult.error) setNotice(postResult.error.message);
    if (taskResult.error) setNotice(taskResult.error.message);
    if (membershipResult.error) setNotice(membershipResult.error.message);
    if (decisionResult.error) setNotice(decisionResult.error.message);

    const nextSpaces = (spaceResult.data ?? []) as AppSpace[];
    const decisionPostIds = new Set((decisionResult.data ?? []).map((comment) => String(comment.post_id)));
    const nextPosts = ((postResult.data ?? []) as AppPost[]).map((post) => ({ ...post, has_decision: decisionPostIds.has(post.id) }));
    const nextTasks = (taskResult.data ?? []) as AppTask[];

    setSpaces(nextSpaces);
    setPosts(nextPosts);
    setTasks(nextTasks);
    setSelectedPostId((current) => current || nextPosts[0]?.id || '');
    setActiveSpaceId((current) => (current === 'all' || nextSpaces.some((space) => space.id === current) ? current : 'all'));

    const profileIds = new Set<string>();
    nextPosts.forEach((post) => profileIds.add(post.author_id));
    nextTasks.forEach((task) => {
      if (task.assignee_id) profileIds.add(task.assignee_id);
      profileIds.add(task.created_by);
    });
    (membershipResult.data ?? []).forEach((membership) => profileIds.add(String(membership.user_id)));

    if (profileIds.size > 0) {
      const nextProfiles = await fetchProfiles([...profileIds]);
      setProfiles(Object.fromEntries(nextProfiles.map((profile) => [profile.id, profile])));
    } else {
      setProfiles({});
    }

    if (!silent) setLoading(false);
  }, []);

  const loadMemberships = useCallback(async (userId: string, preferredWorkspaceId?: string) => {
    if (!supabase) return;

    const membershipResult = await supabase
      .from('memberships')
      .select('workspace_id, role')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true });

    if (membershipResult.error) {
      setNotice(membershipResult.error.message);
      setLoading(false);
      return;
    }

    const memberships = (membershipResult.data ?? []) as { workspace_id: string; role: WorkspaceRole }[];
    const workspaceIds = memberships.map((membership) => membership.workspace_id);

    if (workspaceIds.length === 0) {
      setWorkspaces([]);
      setWorkspaceId('');
      setSpaces([]);
      setPosts([]);
      setTasks([]);
      setLoading(false);
      return;
    }

    const workspaceResult = await supabase
      .from('workspaces')
      .select('id, name, slug, owner_id, logo_url, brand_color, plan, created_at')
      .in('id', workspaceIds);

    if (workspaceResult.error) {
      setNotice(workspaceResult.error.message);
      setLoading(false);
      return;
    }

    const roleByWorkspace = new Map(memberships.map((membership) => [membership.workspace_id, membership.role]));
    const nextWorkspaces = ((workspaceResult.data ?? []) as AppWorkspace[]).map((workspace) => ({
      ...workspace,
      role: roleByWorkspace.get(workspace.id) ?? 'member',
    }));

    const desiredWorkspaceId = preferredWorkspaceId ?? workspaceId;
    const nextWorkspaceId = desiredWorkspaceId && nextWorkspaces.some((workspace) => workspace.id === desiredWorkspaceId)
      ? desiredWorkspaceId
      : nextWorkspaces[0]?.id ?? '';

    setWorkspaces(nextWorkspaces);
    setWorkspaceId(nextWorkspaceId);
    if (nextWorkspaceId) await loadWorkspaceData(nextWorkspaceId);
  }, [loadWorkspaceData, workspaceId]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (inviteToken) {
      window.localStorage.setItem(INVITE_STORAGE_KEY, inviteToken);
    }
  }, [inviteToken]);

  useEffect(() => {
    if (!authReady || !supabase) return;
    if (!session?.user) {
      setLoading(false);
      return;
    }

    void (async () => {
      setLoading(true);
      try {
        await ensureProfile(session);
        let acceptedWorkspaceId: string | undefined;

        if (inviteToken) {
          setInviteAcceptError('');
          acceptedWorkspaceId = await acceptWorkspaceInvitation(session, inviteToken);
          setInviteToken('');
          clearStoredInviteToken();
          const url = new URL(window.location.href);
          url.searchParams.delete('invite');
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }

        await loadMemberships(session.user.id, acceptedWorkspaceId);
      } catch (caughtError) {
        const message = getErrorMessage(caughtError);
        if (inviteToken) setInviteAcceptError(message);
        else setNotice(message);
        setLoading(false);
      }
    })();
  }, [authReady, inviteToken, loadMemberships, session]);

  const loadComments = useCallback(async (postId: string) => {
    if (!supabase || !postId) {
      setComments([]);
      setAttachments([]);
      return;
    }

    const [commentResult, attachmentResult] = await Promise.all([
      supabase
        .from('comments')
        .select('id, workspace_id, post_id, parent_comment_id, author_id, body, is_decision, created_at, updated_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true }),
      supabase
        .from('attachments')
        .select('id, workspace_id, post_id, comment_id, uploaded_by, bucket, object_path, filename, mime_type, byte_size, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true }),
    ]);

    if (commentResult.error || attachmentResult.error) {
      setNotice(commentResult.error?.message ?? attachmentResult.error?.message ?? 'Messages could not be loaded.');
      return;
    }

    const nextComments = (commentResult.data ?? []) as AppComment[];
    setComments(nextComments);
    const nextAttachments = await Promise.all(
      ((attachmentResult.data ?? []) as AppAttachment[]).map(async (attachment) => {
        const { data } = await supabase.storage.from(attachment.bucket).createSignedUrl(attachment.object_path, 3600);
        return { ...attachment, signed_url: data?.signedUrl };
      }),
    );
    setAttachments(nextAttachments);

    const authorIds = [...new Set(nextComments.map((comment) => comment.author_id))];
    if (authorIds.length) {
      const nextProfiles = await fetchProfiles(authorIds);
      setProfiles((current) => ({
        ...current,
        ...Object.fromEntries(nextProfiles.map((profile) => [profile.id, profile])),
      }));
    }
  }, []);

  useEffect(() => {
    if (!supabase || !workspaceId) return;

    const channel = supabase
      .channel(`workspace-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `workspace_id=eq.${workspaceId}` }, () => {
        void loadWorkspaceData(workspaceId, true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `workspace_id=eq.${workspaceId}` }, () => {
        void loadWorkspaceData(workspaceId, true);
        if (selectedPost?.id) void loadComments(selectedPost.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `workspace_id=eq.${workspaceId}` }, () => {
        if (selectedPost?.id) void loadComments(selectedPost.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${workspaceId}` }, () => {
        void loadWorkspaceData(workspaceId, true);
      })
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setNotice(error?.message ?? 'Live updates could not connect. Refresh the page to see new activity while Supabase Realtime is unavailable.');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadComments, loadWorkspaceData, selectedPost?.id, workspaceId]);

  useEffect(() => {
    if (!selectedPost?.id) {
      setComments([]);
      setAttachments([]);
      return;
    }
    void loadComments(selectedPost.id);
  }, [loadComments, selectedPost?.id]);

  useEffect(() => {
    if (view === 'admin' && !canManageAdmin) {
      setView('feed');
    }
  }, [canManageAdmin, view]);

  const currentSpacePosts = activeSpaceId === 'all'
    ? visiblePosts
    : visiblePosts.filter((post) => post.space_id === activeSpaceId);

  if (!isSupabaseConfigured) {
    return <SetupScreen theme={theme} setTheme={setTheme} />;
  }

  if (!authReady || loading) {
    return <LoadingScreen theme={theme} />;
  }

  if (!session?.user) {
    return <AuthScreen theme={theme} setTheme={setTheme} inviteToken={inviteToken} />;
  }

  if (inviteToken) {
    return (
      <InviteAcceptScreen
        theme={theme}
        email={session.user.email ?? ''}
        error={inviteAcceptError}
        onUseInvitedEmail={async () => {
          setInviteAcceptError('');
          if (inviteToken) {
            window.localStorage.setItem(INVITE_STORAGE_KEY, inviteToken);
          }
          await supabase?.auth.signOut();
        }}
        onClear={() => {
          setInviteToken('');
          setInviteAcceptError('');
          clearStoredInviteToken();
          const url = new URL(window.location.href);
          url.searchParams.delete('invite');
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }}
      />
    );
  }

  if (workspaces.length === 0) {
    return (
      <OnboardingScreen
        theme={theme}
        setTheme={setTheme}
        email={session.user.email ?? ''}
        onSignOut={() => void supabase?.auth.signOut()}
        onCreate={async (workspaceName) => {
          await createWorkspace(session, workspaceName);
          await loadMemberships(session.user.id);
        }}
      />
    );
  }

  return (
    <div className={cn('relative h-dvh overflow-hidden font-sans', theme === 'dark' ? 'bg-[#201815] text-[#FFF7E8]' : 'bg-[#F6EAD4] text-[#211A16]')}>
      <AmbientMotifs theme={theme} />
      <div className="relative z-10 grid h-full min-h-0 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar
          activeSpaceId={activeSpaceId}
          onSpaceChange={setActiveSpaceId}
          spaces={spaces}
          theme={theme}
          view={view}
          onViewChange={(nextView) => {
            setView(nextView);
            setSidebarOpen(false);
          }}
          workspaces={workspaces}
          workspaceId={workspaceId}
          sidebarOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onCreateSpace={() => setSpaceModalOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onSignOut={() => void supabase?.auth.signOut()}
          canManageAdmin={canManageAdmin}
        />

        <main className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <header className={cn('shrink-0 border-b px-4 py-4 md:px-6', theme === 'dark' ? 'border-white/10 bg-[#201815]/85' : 'border-[#DFC9A4] bg-[#FFFAF0]/80')}>
            <div className="flex items-center gap-3">
              <button
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
                className={cn('inline-flex h-10 w-10 items-center justify-center rounded-lg border lg:hidden', subtleButton(theme))}
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-xs font-semibold uppercase tracking-[0.24em]', muted(theme))}>Camp</p>
                <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">{selectedWorkspace?.name ?? 'Tribu'}</h1>
              </div>
              <label className={cn('hidden h-11 w-[min(28vw,360px)] items-center gap-2 rounded-lg border px-3 md:flex', surface(theme))}>
                <Search className={cn('h-4 w-4 shrink-0', muted(theme))} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search posts"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-current"
                />
              </label>
              <button
                onClick={() => setComposerOpen(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#332722] px-4 text-sm font-semibold text-[#FFF7E8] shadow-lg shadow-[#332722]/20 transition hover:bg-[#211A16]"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New post</span>
              </button>
            </div>
            <label className={cn('mt-3 flex h-10 items-center gap-2 rounded-lg border px-3 md:hidden', surface(theme))}>
              <Search className={cn('h-4 w-4 shrink-0', muted(theme))} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search posts"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-current"
              />
            </label>
          </header>

          <div className="grid min-h-0 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_390px]">
            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden px-4 py-5 md:px-6">
              {notice && (
                <div className="mb-4 rounded-lg border border-[#E9B93E] bg-[#FFF3C4] px-4 py-3 text-sm text-[#8F4F2E]">
                  {notice}
                </div>
              )}

              {view === 'feed' && (
                <>
                  <Metrics posts={posts} tasks={tasks} theme={theme} />
                  <SortBar sort={sort} setSort={setSort} theme={theme} />
                  <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 scroll-area">
                    {currentSpacePosts.length > 0 ? (
                      <div className="grid gap-4 pb-6">
                        {currentSpacePosts.map((post) => (
                          <div key={post.id}>
                            <PostRow
                              post={post}
                              selected={selectedPost?.id === post.id}
                              profile={profiles[post.author_id]}
                              theme={theme}
                              space={spaces.find((item) => item.id === post.space_id)}
                              onClick={() => setSelectedPostId(post.id)}
                              canManage={post.author_id === session.user.id || canManageAdmin}
                              onEdit={() => setEditingPost(post)}
                              onDelete={async () => {
                                if (!window.confirm('Delete this post and its discussion?')) return;
                                try {
                                  await deletePost(post.id);
                                  if (selectedPostId === post.id) setSelectedPostId('');
                                  await loadWorkspaceData(workspaceId, true);
                                } catch (caughtError) {
                                  setNotice(getErrorMessage(caughtError));
                                }
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        theme={theme}
                        icon={Inbox}
                        title="No posts yet"
                        body="Create the first post for this camp. New activity will stay grouped here instead of disappearing into channels."
                        actionLabel="Create post"
                        onAction={() => setComposerOpen(true)}
                      />
                    )}
                  </div>
                </>
              )}

              {view === 'tasks' && (
                <TasksView
                  tasks={tasks}
                  profiles={profiles}
                  theme={theme}
                  onCreateTask={() => setTaskModalOpen(true)}
                  onEditTask={(task) => setEditingTask(task)}
                  onDeleteTask={async (task) => {
                    if (!window.confirm('Delete this task?')) return;
                    try {
                      await deleteTask(task.id);
                      await loadWorkspaceData(workspaceId, true);
                    } catch (caughtError) {
                      setNotice(getErrorMessage(caughtError));
                    }
                  }}
                  onStatusChange={async (taskId, status) => {
                    try {
                      await updateTaskStatus(taskId, status);
                      await loadWorkspaceData(workspaceId, true);
                    } catch (caughtError) {
                      setNotice(getErrorMessage(caughtError));
                    }
                  }}
                />
              )}
              {view === 'knowledge' && (
                <KnowledgeView
                  posts={posts}
                  spaces={spaces}
                  profiles={profiles}
                  theme={theme}
                  onOpenPost={(postId) => {
                    setSelectedPostId(postId);
                    setView('feed');
                  }}
                  canManagePost={(post) => post.author_id === session.user.id || canManageAdmin}
                  onEditPost={(post) => setEditingPost(post)}
                  onDeletePost={async (post) => {
                    if (!window.confirm('Delete this knowledge entry and its discussion?')) return;
                    try {
                      await deletePost(post.id);
                      if (selectedPostId === post.id) setSelectedPostId('');
                      await loadWorkspaceData(workspaceId, true);
                    } catch (caughtError) {
                      setNotice(getErrorMessage(caughtError));
                    }
                  }}
                />
              )}
              {view === 'admin' && canManageAdmin && (
                <AdminView
                  workspace={selectedWorkspace}
                  theme={theme}
                  onInvite={(email, role) => createWorkspaceInvitation(workspaceId, email, role)}
                />
              )}
            </section>

            <ThreadPanel
              post={selectedPost}
              profile={selectedProfile}
              comments={comments}
              attachments={attachments}
              profiles={profiles}
              theme={theme}
              onReply={async (body, isDecision, files) => {
                if (!selectedPost || !session.user) return;
                await createComment(selectedPost, session.user.id, body, isDecision, files);
                await loadWorkspaceData(workspaceId, true);
                await loadComments(selectedPost.id);
              }}
            />
          </div>
        </main>
      </div>

      {composerOpen && (
        <PostComposer
          theme={theme}
          spaces={spaces}
          defaultSpaceId={activeSpaceId === 'all' ? spaces[0]?.id ?? '' : activeSpaceId}
          onClose={() => setComposerOpen(false)}
          onCreate={async ({ title, body, spaceId }) => {
            if (!session.user) return;
            await createPost(workspaceId, spaceId, session.user.id, title, body);
            setComposerOpen(false);
            await loadWorkspaceData(workspaceId, true);
          }}
        />
      )}

      {editingPost && (
        <PostComposer
          theme={theme}
          spaces={spaces}
          defaultSpaceId={editingPost.space_id}
          initialPost={editingPost}
          onClose={() => setEditingPost(null)}
          onCreate={async ({ title, body, spaceId }) => {
            await updatePost(editingPost.id, { title, body, spaceId });
            setEditingPost(null);
            await loadWorkspaceData(workspaceId, true);
            await loadComments(editingPost.id);
          }}
        />
      )}

      {spaceModalOpen && (
        <SpaceModal
          theme={theme}
          onClose={() => setSpaceModalOpen(false)}
          onCreate={async ({ name, access }) => {
            if (!session.user) return;
            const space = await createSpace(workspaceId, session.user.id, name, access);
            setSpaceModalOpen(false);
            await loadWorkspaceData(workspaceId, true);
            setActiveSpaceId(space.id);
          }}
        />
      )}

      {taskModalOpen && (
        <TaskModal
          theme={theme}
          profiles={memberProfiles}
          onClose={() => setTaskModalOpen(false)}
          onCreate={async ({ title, description, assigneeId, dueAt }) => {
            if (!session.user) return;
            await createTask(workspaceId, session.user.id, { title, description, assigneeId, dueAt });
            setTaskModalOpen(false);
            await loadWorkspaceData(workspaceId, true);
          }}
        />
      )}

      {editingTask && (
        <TaskModal
          theme={theme}
          profiles={memberProfiles}
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onCreate={async ({ title, description, assigneeId, dueAt }) => {
            await updateTask(editingTask.id, { title, description, assigneeId, dueAt });
            setEditingTask(null);
            await loadWorkspaceData(workspaceId, true);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          theme={theme}
          setTheme={setTheme}
          profile={currentProfile}
          email={session.user.email ?? ''}
          workspace={selectedWorkspace}
          role={currentRole}
          onClose={() => setSettingsOpen(false)}
          onSignOut={() => void supabase?.auth.signOut()}
          onSaveProfile={async (input) => {
            if (!session.user) return;
            await updateProfile(session.user.id, input);
            await loadWorkspaceData(workspaceId, true);
          }}
          onUploadAvatar={async (file) => {
            if (!session.user) throw new Error('Sign in before uploading a photo.');
            return uploadAvatar(session.user.id, file);
          }}
        />
      )}
    </div>
  );
}

function AmbientMotifs({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={cn('absolute inset-0', theme === 'dark' ? 'opacity-20' : 'opacity-70')} style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(33,26,22,0.035) 1px, transparent 1px), linear-gradient(rgba(33,26,22,0.035) 1px, transparent 1px), radial-gradient(circle at 78% 8%, rgba(233,185,62,0.22), transparent 22rem)',
        backgroundSize: '36px 36px, 36px 36px, auto',
      }} />
      <svg className={cn('absolute right-8 top-6 h-72 w-72', theme === 'dark' ? 'text-[#F7D774]/10' : 'text-[#211A16]/10')} viewBox="0 0 200 200" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeLinecap="square" strokeWidth="10">
          <circle cx="100" cy="100" r="34" />
          <path d="M100 8v38M100 154v38M8 100h38M154 100h38M35 35l27 27M138 138l27 27M165 35l-27 27M62 138l-27 27" />
          <path d="M100 8l13 38M100 8 87 46M100 192l13-38M100 192l-13-38M8 100l38-13M8 100l38 13M192 100l-38-13M192 100l-38 13" />
        </g>
      </svg>
    </div>
  );
}

function TribuLogo({ className = '' }: { className?: string }) {
  return (
    <img src={tribuLogoUrl} alt="" className={cn('object-contain mix-blend-multiply', className)} aria-hidden="true" />
  );
}

function Sidebar({
  activeSpaceId,
  onSpaceChange,
  spaces,
  theme,
  view,
  onViewChange,
  workspaces,
  workspaceId,
  sidebarOpen,
  onClose,
  onCreateSpace,
  onOpenSettings,
  onSignOut,
  canManageAdmin,
}: {
  activeSpaceId: string;
  onSpaceChange: (spaceId: string) => void;
  spaces: AppSpace[];
  theme: 'light' | 'dark';
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  workspaces: AppWorkspace[];
  workspaceId: string;
  sidebarOpen: boolean;
  onClose: () => void;
  onCreateSpace: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  canManageAdmin: boolean;
}) {
  const currentRole = workspaces.find((workspace) => workspace.id === workspaceId)?.role;
  const canManageSpaces = currentRole === 'owner' || currentRole === 'admin';
  const currentRoleLabel = currentRole ? getRoleLabel(currentRole) : 'camp';

  return (
    <>
      <div className={cn('fixed inset-0 z-40 bg-black/30 lg:hidden', sidebarOpen ? 'block' : 'hidden')} onClick={onClose} />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-dvh w-[280px] flex-col overflow-hidden border-r px-4 py-5 transition-transform lg:static lg:z-auto lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          theme === 'dark' ? 'border-white/10 bg-[#201815]/95' : 'border-[#DFC9A4] bg-[#332722]',
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E9B93E] text-[#211A16] shadow-lg shadow-[#8F4F2E]/20">
              <TribuLogo className="h-9 w-9" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold tracking-tight text-[#FFF7E8]">Tribu</p>
              <p className="truncate text-xs text-[#DFC9A4]">{currentRoleLabel}</p>
            </div>
          </div>
          <button aria-label="Close navigation" onClick={onClose} className={cn('rounded-lg border p-2 lg:hidden', subtleButton(theme))}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-1">
          <NavButton icon={MessageSquare} label="Active Feed" active={view === 'feed'} onClick={() => onViewChange('feed')} theme={theme} />
          <NavButton icon={ClipboardList} label="Tasks" active={view === 'tasks'} onClick={() => onViewChange('tasks')} theme={theme} />
          <NavButton icon={FileText} label="Knowledge" active={view === 'knowledge'} onClick={() => onViewChange('knowledge')} theme={theme} />
          {canManageAdmin && <NavButton icon={ShieldCheck} label="Admin" active={view === 'admin'} onClick={() => onViewChange('admin')} theme={theme} />}
        </nav>

        <section className="mt-7 min-h-0 overflow-hidden">
          <div className="mb-3 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#DFC9A4]">
            Trails
            {canManageSpaces && (
              <button aria-label="Create trail" onClick={onCreateSpace} className="rounded p-1 hover:bg-[#FFF7E8]/10">
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="space-y-2">
            <button
              onClick={() => onSpaceChange('all')}
              className={cn('w-full rounded-lg border p-3 text-left text-sm font-semibold transition', activeSpaceId === 'all' ? 'border-[#E9B93E] bg-[#E9B93E]/25 text-[#FFF7E8]' : 'border-[#FFF7E8]/15 bg-[#FFF7E8]/8 text-[#FFF7E8]')}
            >
              All posts
            </button>
            {spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => onSpaceChange(space.id)}
                className={cn('w-full rounded-lg border p-3 text-left transition', activeSpaceId === space.id ? 'border-[#E9B93E] bg-[#E9B93E]/25 text-[#FFF7E8]' : 'border-[#FFF7E8]/15 bg-[#FFF7E8]/8 text-[#FFF7E8]')}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#E9B93E]" />
                  <span className="truncate text-sm font-semibold">{space.name}</span>
                </div>
                <p className={cn('mt-1 text-xs capitalize', activeSpaceId === space.id ? 'text-[#F7D774]' : 'text-[#DFC9A4]')}>{getTrailAccessLabel(space.access)} trail</p>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          <button onClick={onOpenSettings} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#FFF7E8]/15 bg-[#FFF7E8]/8 text-sm font-semibold text-[#FFF7E8]">
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <button onClick={onSignOut} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#FFF7E8]/15 bg-[#FFF7E8]/8 text-sm font-semibold text-[#FFF7E8]">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

function Metrics({ posts, tasks, theme }: { posts: AppPost[]; tasks: AppTask[]; theme: 'light' | 'dark' }) {
  const openPosts = posts.filter((post) => post.state === 'open').length;
  const decisions = posts.filter((post) => post.has_decision).length;
  const openTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled').length;

  return (
    <div className="grid shrink-0 gap-3 sm:grid-cols-3">
      <MetricCard label="Open posts" value={openPosts} theme={theme} />
      <MetricCard label="Decisions" value={decisions} theme={theme} />
      <MetricCard label="Open tasks" value={openTasks} theme={theme} />
    </div>
  );
}

function MetricCard({ label, value, theme }: { label: string; value: number; theme: 'light' | 'dark' }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg border p-4', surface(theme))}>
      <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', muted(theme))}>{label}</p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
    </div>
  );
}

function SortBar({ sort, setSort, theme }: { sort: SortMode; setSort: (sort: SortMode) => void; theme: 'light' | 'dark' }) {
  return (
    <div className={cn('mt-4 flex shrink-0 gap-2 overflow-hidden rounded-lg border p-1', surface(theme))}>
      {sortOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => setSort(option.value)}
          className={cn('h-9 rounded-md px-3 text-sm font-semibold transition', sort === option.value ? 'bg-[#E9B93E] text-[#211A16] shadow-sm' : cn(muted(theme), 'hover:bg-[#FFF3C4]'))}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PostRow({
  post,
  selected,
  profile,
  theme,
  space,
  onClick,
  canManage,
  onEdit,
  onDelete,
}: {
  post: AppPost;
  selected: boolean;
  profile?: AppProfile;
  theme: 'light' | 'dark';
  space?: AppSpace;
  onClick: () => void;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onClick();
      }}
      className={cn('w-full rounded-lg border p-4 text-left transition', selected ? 'border-[#E9B93E] shadow-lg shadow-[#8F4F2E]/15' : surface(theme))}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill state={post.state} />
        {space && <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', theme === 'dark' ? 'bg-white/10 text-[#DFC9A4]' : 'bg-[#E4F1F3] text-[#185C74]')}>{space.name}</span>}
        <span className={cn('ml-auto text-xs', muted(theme))}>{formatTimeAgo(post.last_activity_at)}</span>
      </div>
      <h2 className="mt-3 text-lg font-bold tracking-tight">{post.title}</h2>
      <p className={cn('mt-2 line-clamp-2 text-sm leading-6', muted(theme))}>{post.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar profile={profile} />
          <span className="truncate text-sm font-semibold">{profile?.display_name ?? 'Camp member'}</span>
        </div>
        {canManage && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="Edit post"
              title="Edit post"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg border', subtleButton(theme))}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete post"
              title="Delete post"
              onClick={(event) => {
                event.stopPropagation();
                void onDelete();
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadPanel({
  post,
  profile,
  comments,
  attachments,
  profiles,
  theme,
  onReply,
}: {
  post?: AppPost;
  profile?: AppProfile;
  comments: AppComment[];
  attachments: AppAttachment[];
  profiles: Record<string, AppProfile>;
  theme: 'light' | 'dark';
  onReply: (body: string, isDecision: boolean, files: File[]) => Promise<void>;
}) {
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isDecision, setIsDecision] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const latestMessageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [post?.id, comments.length, attachments.length]);

  const addFiles = (incoming: FileList | File[]) => {
    const accepted = Array.from(incoming).filter((file) => file.size <= 100 * 1024 * 1024);
    setFiles((current) => [...current, ...accepted].slice(0, 10));
    if (accepted.length !== Array.from(incoming).length) setError('Each attachment must be 100 MB or smaller.');
  };

  if (!post) {
    return (
      <aside className={cn('hidden min-h-0 overflow-hidden border-l p-6 xl:flex xl:flex-col', theme === 'dark' ? 'border-white/10 bg-[#241A13]/55' : 'border-[#DFC9A4] bg-[#FFFAF0]/45')}>
        <EmptyState theme={theme} icon={MessageSquare} title="No thread selected" body="Select or create a post to view its discussion." />
      </aside>
    );
  }

  return (
    <aside className={cn('hidden min-h-0 overflow-hidden border-l xl:flex xl:flex-col', theme === 'dark' ? 'border-white/10 bg-[#241A13]/55' : 'border-[#DFC9A4] bg-[#FFFAF0]/45')}>
      <div className="shrink-0 border-b border-inherit p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <StatusPill state={post.state} />
            <h2 className="mt-3 text-xl font-bold tracking-tight">{post.title}</h2>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 scroll-area">
        <ThreadCard profile={profile} body={post.body} timestamp={post.created_at} theme={theme} />
        <div className="mt-4 space-y-3">
          {comments.map((comment) => (
            <div key={comment.id}>
              <ThreadCard
                profile={profiles[comment.author_id]}
                body={comment.body}
                timestamp={comment.created_at}
                theme={theme}
                isDecision={comment.is_decision}
                attachments={attachments.filter((attachment) => attachment.comment_id === comment.id)}
              />
            </div>
          ))}
          <div ref={latestMessageRef} />
        </div>
      </div>

      <form
        className={cn('shrink-0 border-t p-4', dragActive && 'ring-2 ring-inset ring-[#E9B93E]', theme === 'dark' ? 'border-white/10 bg-[#201815]' : 'border-[#DFC9A4] bg-[#F6EAD4]')}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragActive(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          addFiles(event.dataTransfer.files);
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!reply.trim() && files.length === 0) return;
          setSubmitting(true);
          setError('');
          try {
            await onReply(reply.trim(), isDecision, files);
            setReply('');
            setFiles([]);
            setIsDecision(false);
          } catch (caughtError) {
            setError(getErrorMessage(caughtError));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <textarea
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Reply to this post"
          className={cn('h-24 w-full resize-none rounded-lg border bg-transparent p-3 text-sm leading-6 outline-none', subtleButton(theme))}
        />
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {files.map((file, index) => (
              <span key={`${file.name}-${index}`} className={cn('inline-flex max-w-full items-center gap-2 rounded-lg border px-2 py-1 text-xs', subtleButton(theme))}>
                <FileIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{file.name}</span>
                <button type="button" aria-label={`Remove ${file.name}`} title="Remove attachment" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        {dragActive && <p className="mt-2 text-center text-sm font-semibold text-[#8F4F2E]">Drop files to attach</p>}
        {error && <p className="mt-2 text-sm font-semibold text-[#B91C1C]">{error}</p>}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            aria-label="Add attachments"
            title="Add images, videos, or files"
            onClick={() => fileInputRef.current?.click()}
            className={cn('inline-flex h-10 w-10 items-center justify-center rounded-lg border', subtleButton(theme))}
          >
            <Plus className="h-4 w-4" />
          </button>
          <label className={cn('flex items-center gap-2 text-sm', muted(theme))}>
            <input type="checkbox" checked={isDecision} onChange={(event) => setIsDecision(event.target.checked)} className="h-4 w-4 accent-[#8F4F2E]" />
            Decision
          </label>
          <button disabled={submitting || (!reply.trim() && files.length === 0)} className="ml-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Reply
          </button>
        </div>
      </form>
    </aside>
  );
}

function ThreadCard({ profile, body, timestamp, theme, isDecision, attachments = [] }: { profile?: AppProfile; body: string; timestamp: string; theme: 'light' | 'dark'; isDecision?: boolean; attachments?: AppAttachment[] }) {
  return (
    <div className={cn('rounded-lg border p-4', surface(theme))}>
      <div className="mb-3 flex items-center gap-3">
        <Avatar profile={profile} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{profile?.display_name ?? 'Camp member'}</p>
          <p className={cn('text-xs', muted(theme))}>{formatTimeAgo(timestamp)}</p>
        </div>
        {isDecision && <CheckCircle2 className="ml-auto h-4 w-4 text-[#0F766E]" />}
      </div>
      {body && <p className={cn('whitespace-pre-wrap text-sm leading-6', muted(theme))}>{body}</p>}
      {attachments.length > 0 && (
        <div className={cn('grid gap-2', body && 'mt-3')}>
          {attachments.map((attachment) => (
            <div key={attachment.id}>
              <AttachmentPreview attachment={attachment} theme={theme} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentPreview({ attachment, theme }: { attachment: AppAttachment; theme: 'light' | 'dark' }) {
  if (!attachment.signed_url) return null;
  if (attachment.mime_type.startsWith('image/')) {
    return <a href={attachment.signed_url} target="_blank" rel="noreferrer"><img src={attachment.signed_url} alt={attachment.filename} className="max-h-64 w-full rounded-lg border object-contain" /></a>;
  }
  if (attachment.mime_type.startsWith('video/')) {
    return <video src={attachment.signed_url} controls preload="metadata" className="max-h-64 w-full rounded-lg border" />;
  }
  return (
    <a href={attachment.signed_url} target="_blank" rel="noreferrer" className={cn('flex items-center gap-3 rounded-lg border p-3 text-sm', subtleButton(theme))}>
      <FileIcon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-semibold">{attachment.filename}</span>
      <span className={cn('shrink-0 text-xs', muted(theme))}>{formatFileSize(attachment.byte_size)}</span>
      <Download className="h-4 w-4 shrink-0" />
    </a>
  );
}

function TasksView({
  tasks,
  profiles,
  theme,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  onStatusChange,
}: {
  tasks: AppTask[];
  profiles: Record<string, AppProfile>;
  theme: 'light' | 'dark';
  onCreateTask: () => void;
  onEditTask: (task: AppTask) => void;
  onDeleteTask: (task: AppTask) => Promise<void>;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void>;
}) {
  if (tasks.length === 0) {
    return <EmptyState theme={theme} icon={ClipboardList} title="No tasks yet" body="Create tasks for follow-ups, assignments, and camp work that should not get lost in posts." actionLabel="Create task" onAction={onCreateTask} />;
  }

  return (
    <StaticPanel theme={theme} title="Tasks" icon={ClipboardList}>
      <div className="mb-4 flex justify-end">
        <button onClick={onCreateTask} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" />
          New task
        </button>
      </div>
      <div className="grid gap-3 overflow-y-auto pr-1 scroll-area">
        {tasks.map((task) => (
          <div key={task.id} className={cn('grid gap-4 rounded-lg border p-4 xl:grid-cols-[minmax(0,1fr)_180px_180px]', surface(theme))}>
            <div className="min-w-0">
              <p className="font-semibold">{task.title}</p>
              {task.description && <p className={cn('mt-1 line-clamp-2 text-sm leading-6', muted(theme))}>{task.description}</p>}
              {task.due_at && <p className={cn('mt-2 text-xs font-semibold', muted(theme))}>Due {new Date(task.due_at).toLocaleDateString()}</p>}
            </div>
            <div className="flex items-center gap-3">
              <Avatar profile={task.assignee_id ? profiles[task.assignee_id] : undefined} />
              <p className={cn('min-w-0 truncate text-sm', muted(theme))}>{task.assignee_id ? profiles[task.assignee_id]?.display_name ?? 'Assigned' : 'Unassigned'}</p>
            </div>
            <div className="flex flex-col items-stretch gap-2 xl:items-end">
              <select
                value={task.status}
                onChange={(event) => void onStatusChange(task.id, event.target.value as TaskStatus)}
                className={cn('h-10 w-full rounded-lg border bg-transparent px-3 text-sm font-semibold capitalize outline-none xl:w-44', subtleButton(theme))}
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
                <option value="canceled">Canceled</option>
              </select>
              <div className="flex items-center gap-2 xl:justify-end">
                <button
                  type="button"
                  aria-label="Edit task"
                  title="Edit task"
                  onClick={() => onEditTask(task)}
                  className={cn('inline-flex h-10 w-10 items-center justify-center rounded-lg border', subtleButton(theme))}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Delete task"
                  title="Delete task"
                  onClick={() => void onDeleteTask(task)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </StaticPanel>
  );
}

function KnowledgeView({
  posts,
  spaces,
  profiles,
  theme,
  onOpenPost,
  canManagePost,
  onEditPost,
  onDeletePost,
}: {
  posts: AppPost[];
  spaces: AppSpace[];
  profiles: Record<string, AppProfile>;
  theme: 'light' | 'dark';
  onOpenPost: (postId: string) => void;
  canManagePost: (post: AppPost) => boolean;
  onEditPost: (post: AppPost) => void;
  onDeletePost: (post: AppPost) => Promise<void>;
}) {
  const knowledgePosts = posts
    .filter((post) => post.state !== 'archived' && (post.has_decision || post.state === 'read_only' || post.state === 'locked'))
    .sort((a, b) => Number(b.has_decision) - Number(a.has_decision) || new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());

  if (knowledgePosts.length === 0) {
    return (
      <StaticPanel theme={theme} title="Knowledge" icon={FileText}>
        <EmptyState theme={theme} icon={FileText} title="No knowledge entries yet" body="Mark important replies as Decisions to turn active discussions into a searchable camp knowledge base." />
      </StaticPanel>
    );
  }

  return (
    <StaticPanel theme={theme} title="Knowledge" icon={FileText}>
      <div className="grid gap-3 overflow-y-auto pr-1 scroll-area">
        {knowledgePosts.map((post) => {
          const space = spaces.find((item) => item.id === post.space_id);
          const profile = profiles[post.author_id];
          const canManage = canManagePost(post);
          return (
            <div
              key={post.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenPost(post.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onOpenPost(post.id);
              }}
              className={cn('w-full rounded-lg border p-4 text-left transition hover:border-[#E9B93E]', surface(theme))}
            >
              <div className="flex flex-wrap items-center gap-2">
                {post.has_decision && <span className="rounded-full bg-[#D1FAE5] px-2.5 py-1 text-xs font-semibold text-[#065F46]">Decision</span>}
                {space && <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', theme === 'dark' ? 'bg-white/10 text-[#DFC9A4]' : 'bg-[#E4F1F3] text-[#185C74]')}>{space.name}</span>}
                <span className={cn('ml-auto text-xs', muted(theme))}>{formatTimeAgo(post.last_activity_at)}</span>
              </div>
              <h3 className="mt-3 text-lg font-bold">{post.title}</h3>
              <p className={cn('mt-2 line-clamp-3 text-sm leading-6', muted(theme))}>{post.body}</p>
              <div className="mt-4 flex items-center gap-3">
                <Avatar profile={profile} />
                <span className="text-sm font-semibold">{profile?.display_name ?? 'Camp member'}</span>
                {canManage && (
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Edit knowledge entry"
                      title="Edit knowledge entry"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditPost(post);
                      }}
                      className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg border', subtleButton(theme))}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete knowledge entry"
                      title="Delete knowledge entry"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onDeletePost(post);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </StaticPanel>
  );
}

function AdminView({
  workspace,
  theme,
  onInvite,
}: {
  workspace?: AppWorkspace;
  theme: 'light' | 'dark';
  onInvite: (email: string, role: WorkspaceRole) => Promise<string>;
}) {
  return (
    <StaticPanel theme={theme} title="Admin" icon={ShieldCheck}>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={cn('rounded-lg border p-4', surface(theme))}>
          <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', muted(theme))}>Camp</p>
          <h2 className="mt-2 text-xl font-bold">{workspace?.name}</h2>
          <p className={cn('mt-1 text-sm capitalize', muted(theme))}>{workspace?.plan ?? 'free'} plan</p>
        </div>
        <div className={cn('rounded-lg border p-4', surface(theme))}>
          <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', muted(theme))}>Permissions</p>
          <div className="mt-3 space-y-3">
            {workspaceRoles.map(({ role, detail }) => (
              <div key={role} className="flex gap-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#8F4F2E]" />
                <div>
                  <p className="text-sm font-semibold capitalize">{getRoleLabel(role)}</p>
                  <p className={cn('text-sm', muted(theme))}>{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <InvitePanel theme={theme} onInvite={onInvite} />
      </div>
    </StaticPanel>
  );
}

function InvitePanel({ theme, onInvite }: { theme: 'light' | 'dark'; onInvite: (email: string, role: WorkspaceRole) => Promise<string> }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className={cn('rounded-lg border p-4 xl:col-span-2', surface(theme))}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF3C4] text-[#8F4F2E]">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold">Invite by role</h3>
          <p className={cn('text-sm', muted(theme))}>Add Admins, Members, or Guests with an invite link tied to their email.</p>
        </div>
      </div>
      <form
        className="grid gap-3 md:grid-cols-[1fr_160px_auto]"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!email.trim()) return;
          setSubmitting(true);
          setError('');
          setCopied(false);
          try {
            const link = await onInvite(email.trim(), role);
            setInviteLink(link);
          } catch (caughtError) {
            setError(getErrorMessage(caughtError));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="person@company.com"
          className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))}
        />
        <select value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))}>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="guest">Guest</option>
        </select>
        <button disabled={submitting || !email.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Invite
        </button>
      </form>
      {inviteLink && (
        <div className={cn('mt-4 rounded-lg border p-3 text-sm', subtleButton(theme))}>
          <p className="mb-2 font-semibold">Invite link</p>
          <div className="flex gap-2">
            <input readOnly value={inviteLink} className="min-w-0 flex-1 bg-transparent outline-none" />
            <button
              className="inline-flex items-center gap-2 rounded-md bg-[#8F4F2E] px-3 py-2 text-xs font-semibold text-white"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink);
                setCopied(true);
              }}
              type="button"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm font-semibold text-[#B91C1C]">{error}</p>}
    </div>
  );
}

function StaticPanel({ theme, title, icon: Icon, children }: { theme: 'light' | 'dark'; title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="min-h-0 overflow-hidden">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#332722] text-[#FFF7E8]">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function PostComposer({
  theme,
  spaces,
  defaultSpaceId,
  initialPost,
  onClose,
  onCreate,
}: {
  theme: 'light' | 'dark';
  spaces: AppSpace[];
  defaultSpaceId: string;
  initialPost?: AppPost;
  onClose: () => void;
  onCreate: (input: { title: string; body: string; spaceId: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initialPost?.title ?? '');
  const [body, setBody] = useState(initialPost?.body ?? '');
  const [spaceId, setSpaceId] = useState(defaultSpaceId);
  const [submitting, setSubmitting] = useState(false);

  return (
    <ModalShell theme={theme} title={initialPost ? 'Edit post' : 'New post'} onClose={onClose}>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!title.trim() || !body.trim() || !spaceId) return;
          setSubmitting(true);
          await onCreate({ title: title.trim(), body: body.trim(), spaceId });
          setSubmitting(false);
        }}
      >
        <label className="grid gap-2 text-sm font-semibold">
          Trail
          <select value={spaceId} onChange={(event) => setSpaceId(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))}>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Body
          <textarea value={body} onChange={(event) => setBody(event.target.value)} className={cn('h-36 resize-none rounded-lg border bg-transparent p-3 outline-none', subtleButton(theme))} />
        </label>
        <button disabled={submitting || !title.trim() || !body.trim() || !spaceId} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {initialPost ? 'Save post' : 'Publish'}
        </button>
      </form>
    </ModalShell>
  );
}

function SpaceModal({
  theme,
  onClose,
  onCreate,
}: {
  theme: 'light' | 'dark';
  onClose: () => void;
  onCreate: (input: { name: string; access: SpaceAccess }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [access, setAccess] = useState<SpaceAccess>('public');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  return (
    <ModalShell theme={theme} title="Create trail" onClose={onClose}>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim()) return;
          setSubmitting(true);
          setError('');
          try {
            await onCreate({ name: name.trim(), access });
          } catch (caughtError) {
            setError(getErrorMessage(caughtError));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <label className="grid gap-2 text-sm font-semibold">
          Trail name
          <input value={name} onChange={(event) => setName(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Access
          <select value={access} onChange={(event) => setAccess(event.target.value as SpaceAccess)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))}>
            <option value="public">Public trail</option>
            <option value="private">Private trail</option>
            <option value="invite_only">Invite-only trail</option>
          </select>
        </label>
        <button disabled={submitting || !name.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create trail
        </button>
        {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}
      </form>
    </ModalShell>
  );
}

function TaskModal({
  theme,
  profiles,
  task,
  onClose,
  onCreate,
}: {
  theme: 'light' | 'dark';
  profiles: AppProfile[];
  task?: AppTask;
  onClose: () => void;
  onCreate: (input: { title: string; description: string; assigneeId: string; dueAt: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '');
  const [dueAt, setDueAt] = useState(task?.due_at ? task.due_at.slice(0, 10) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  return (
    <ModalShell theme={theme} title={task ? 'Edit task' : 'New task'} onClose={onClose}>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!title.trim()) return;
          setSubmitting(true);
          setError('');
          try {
            await onCreate({ title: title.trim(), description: description.trim(), assigneeId, dueAt });
          } catch (caughtError) {
            setError(getErrorMessage(caughtError));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <label className="grid gap-2 text-sm font-semibold">
          Task title
          <input value={title} onChange={(event) => setTitle(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={cn('h-28 resize-none rounded-lg border bg-transparent p-3 outline-none', subtleButton(theme))} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Assignee
            <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))}>
              <option value="">Unassigned</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Due date
            <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
          </label>
        </div>
        <button disabled={submitting || !title.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {task ? 'Save task' : 'Create task'}
        </button>
        {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}
      </form>
    </ModalShell>
  );
}

function SettingsModal({
  theme,
  setTheme,
  profile,
  email,
  workspace,
  role,
  onClose,
  onSignOut,
  onSaveProfile,
  onUploadAvatar,
}: {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  profile?: AppProfile;
  email: string;
  workspace?: AppWorkspace;
  role?: WorkspaceRole;
  onClose: () => void;
  onSignOut: () => void;
  onSaveProfile: (input: { displayName: string; avatarUrl: string; phone: string; address: string; timezone: string; bio: string }) => Promise<void>;
  onUploadAvatar: (file: File) => Promise<string>;
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? email.split('@')[0] ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [address, setAddress] = useState(profile?.address ?? '');
  const [timezone, setTimezone] = useState(profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <ModalShell theme={theme} title="Settings" onClose={onClose}>
      <div className="grid gap-5">
        <section className={cn('rounded-lg border p-4', surface(theme))}>
          <div className="mb-4 flex items-center gap-3">
            <Avatar profile={{ id: profile?.id ?? '', email, display_name: displayName || 'Member', avatar_url: avatarUrl || null, timezone }} />
            <div className="min-w-0">
              <p className="truncate font-bold">{displayName || 'Camp member'}</p>
              <p className={cn('truncate text-sm', muted(theme))}>{workspace?.name ?? 'Camp'} · {role ? getRoleLabel(role) : 'Member'}</p>
            </div>
          </div>
          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!displayName.trim()) return;
              setSubmitting(true);
              setSaved(false);
              setError('');
              try {
                await onSaveProfile({
                  displayName: displayName.trim(),
                  avatarUrl: avatarUrl.trim(),
                  phone: phone.trim(),
                  address: address.trim(),
                  timezone: timezone.trim(),
                  bio: bio.trim(),
                });
                setSaved(true);
              } catch (caughtError) {
                setError(getErrorMessage(caughtError));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <label className="grid gap-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><User className="h-4 w-4" /> Name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4" /> Tribu email</span>
              <input readOnly value={email} className={cn('h-11 cursor-not-allowed rounded-lg border bg-transparent px-3 opacity-75 outline-none', subtleButton(theme))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" /> Contact number</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Address
              <input value={address} onChange={(event) => setAddress(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><Camera className="h-4 w-4" /> Photo URL</span>
              <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
            </label>
            <div className="grid gap-2 text-sm font-semibold">
              <span>Or upload a photo</span>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  setUploadingAvatar(true);
                  setError('');
                  try {
                    setAvatarUrl(await onUploadAvatar(file));
                  } catch (caughtError) {
                    setError(getErrorMessage(caughtError));
                  } finally {
                    setUploadingAvatar(false);
                  }
                }}
              />
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
                className={cn('inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4', subtleButton(theme))}
              >
                {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {uploadingAvatar ? 'Uploading...' : 'Choose image'}
              </button>
            </div>
            <label className="grid gap-2 text-sm font-semibold">
              Time zone
              <input value={timezone} onChange={(event) => setTimezone(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              About
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} className={cn('h-24 resize-none rounded-lg border bg-transparent p-3 outline-none', subtleButton(theme))} />
            </label>
            <button disabled={submitting || !displayName.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save profile
            </button>
            {saved && <p className="text-sm font-semibold text-[#0F766E]">Profile saved.</p>}
            {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}
          </form>
        </section>

        <section className={cn('rounded-lg border p-4', surface(theme))}>
          <p className="font-bold">Appearance</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTheme('light')} className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold', theme === 'light' ? 'border-[#E9B93E] bg-[#E9B93E] text-[#211A16]' : subtleButton(theme))}>
              <Sun className="h-4 w-4" />
              Light
            </button>
            <button type="button" onClick={() => setTheme('dark')} className={cn('inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold', theme === 'dark' ? 'border-[#E9B93E] bg-[#E9B93E] text-[#211A16]' : subtleButton(theme))}>
              <Moon className="h-4 w-4" />
              Dark
            </button>
          </div>
        </section>

        <button onClick={onSignOut} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#8F4F2E]/30 px-4 text-sm font-semibold text-[#8F4F2E]">
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ theme, title, children, onClose }: { theme: 'light' | 'dark'; title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4">
      <div className={cn('max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border p-5 shadow-2xl scroll-area', theme === 'dark' ? 'border-white/10 bg-[#201815]' : 'border-[#DFC9A4] bg-[#FFFAF0]')}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button aria-label="Close modal" onClick={onClose} className={cn('rounded-lg border p-2', subtleButton(theme))}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AuthScreen({ theme, setTheme, inviteToken }: { theme: 'light' | 'dark'; setTheme: (theme: 'light' | 'dark') => void; inviteToken: string }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <CenteredScreen theme={theme} setTheme={setTheme}>
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E9B93E] text-[#211A16] shadow-lg shadow-[#8F4F2E]/20">
          <TribuLogo className="h-12 w-12" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">{inviteToken ? 'Accept your invite' : 'Sign in to Tribu'}</h1>
        <p className={cn('mt-3 text-sm leading-6', muted(theme))}>
          {inviteToken
            ? 'Use the exact email address that received this invite.'
            : 'Enter the email connected to your Camp. Chiefs, Admins, Members, and Guests all use the same sign-in.'}
        </p>
        <form
          className="mt-6 grid gap-3 text-left"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!supabase || !email.trim()) return;
            setSubmitting(true);
            setError('');
            const redirectUrl = new URL(window.location.href);
            redirectUrl.hash = '';
            redirectUrl.search = '';
            if (inviteToken) redirectUrl.searchParams.set('invite', inviteToken);
            const { error: signInError } = await supabase.auth.signInWithOtp({
              email: email.trim(),
              options: { emailRedirectTo: redirectUrl.toString() },
            });
            setSubmitting(false);
            if (signInError) setError(signInError.message);
            else setSent(true);
          }}
        >
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@company.com" className={cn('h-12 rounded-lg border bg-transparent px-4 outline-none', subtleButton(theme))} />
          <button disabled={submitting || !email.trim()} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Send magic link
          </button>
          {sent && <p className="text-sm font-semibold text-[#0F766E]">Check your email for a sign-in link.</p>}
          {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}
        </form>
      </div>
    </CenteredScreen>
  );
}

function OnboardingScreen({
  theme,
  setTheme,
  email,
  onCreate,
  onSignOut,
}: {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  email: string;
  onCreate: (name: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [creatingCamp, setCreatingCamp] = useState(false);

  return (
    <CenteredScreen theme={theme} setTheme={setTheme}>
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E9B93E] text-[#211A16] shadow-lg shadow-[#8F4F2E]/20">
          <TribuLogo className="h-12 w-12" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">No Camp found</h1>
        <p className={cn('mt-3 text-sm leading-6', muted(theme))}>
          You are signed in as {email}, but this email is not a member of any Camp yet. If you expected access, use the invited email or ask your Chief/Admin for an invite.
        </p>
        {!creatingCamp && (
          <div className="mt-6 grid gap-3 text-left">
            <button type="button" onClick={onSignOut} className="inline-flex h-12 items-center justify-center rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white">
              Sign in with a different email
            </button>
            <button type="button" onClick={() => setCreatingCamp(true)} className={cn('inline-flex h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold', subtleButton(theme))}>
              Create a new Camp instead
            </button>
          </div>
        )}
        {creatingCamp && (
          <form
            className="mt-6 grid gap-3 text-left"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!name.trim()) return;
              setSubmitting(true);
              setError('');
              try {
                await onCreate(name.trim());
              } catch (caughtError) {
                setError(getErrorMessage(caughtError));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <div className={cn('rounded-lg border px-4 py-3 text-sm leading-6', surface(theme))}>
              This creates a separate Camp and makes {email} the Chief. Do this only if you are starting a new Camp.
            </div>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New Camp name" className={cn('h-12 rounded-lg border bg-transparent px-4 outline-none', subtleButton(theme))} />
            <button disabled={submitting || !name.trim()} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create new Camp as Chief
            </button>
            <button type="button" onClick={() => setCreatingCamp(false)} className={cn('inline-flex h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold', subtleButton(theme))}>
              Back to sign-in options
            </button>
            {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}
          </form>
        )}
      </div>
    </CenteredScreen>
  );
}

function SetupScreen({ theme, setTheme }: { theme: 'light' | 'dark'; setTheme: (theme: 'light' | 'dark') => void }) {
  return (
    <CenteredScreen theme={theme} setTheme={setTheme}>
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight">Connect Supabase</h1>
        <p className={cn('mt-3 text-sm leading-6', muted(theme))}>
          Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your environment, then restart the app.
        </p>
      </div>
    </CenteredScreen>
  );
}

function LoadingScreen({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className={cn('relative flex h-dvh items-center justify-center overflow-hidden', theme === 'dark' ? 'bg-[#201815] text-[#FFF7E8]' : 'bg-[#F6EAD4] text-[#211A16]')}>
      <AmbientMotifs theme={theme} />
      <Loader2 className="relative z-10 h-6 w-6 animate-spin text-[#8F4F2E]" />
    </div>
  );
}

function InviteAcceptScreen({
  theme,
  email,
  error,
  onUseInvitedEmail,
  onClear,
}: {
  theme: 'light' | 'dark';
  email: string;
  error: string;
  onUseInvitedEmail: () => Promise<void>;
  onClear: () => void;
}) {
  const emailMismatch = error.toLowerCase().includes('different email');

  return (
    <div className={cn('relative grid h-dvh overflow-hidden p-4', theme === 'dark' ? 'bg-[#201815] text-[#FFF7E8]' : 'bg-[#F6EAD4] text-[#211A16]')}>
      <AmbientMotifs theme={theme} />
      <div className="mx-auto max-w-md place-self-center text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#8F4F2E] text-white shadow-lg shadow-[#8F4F2E]/20">
          {error ? <X className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">{error ? 'Invite could not be accepted' : 'Accepting invite'}</h1>
        <p className={cn('mt-3 text-sm leading-6', muted(theme))}>
          {error
            ? emailMismatch
              ? `You are currently signed in as ${email}. This invite belongs to another email address.`
              : 'This invite could not be completed. Ask the camp Chief or admin to send a fresh invite link.'
            : `Signed in as ${email}. Adding you to the invited camp...`}
        </p>
        {error && <p className="mt-4 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-left text-sm font-semibold text-[#B91C1C]">{error}</p>}
        {error && (
          <div className="mt-4 grid gap-2">
            {emailMismatch && (
              <button onClick={() => void onUseInvitedEmail()} className="inline-flex h-11 items-center justify-center rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white">
                Sign in with invited email
              </button>
            )}
            <button onClick={onClear} className={cn('inline-flex h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold', subtleButton(theme))}>
              Clear invite and continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredScreen({ theme, setTheme, children }: { theme: 'light' | 'dark'; setTheme: (theme: 'light' | 'dark') => void; children: ReactNode }) {
  return (
    <div className={cn('relative grid h-dvh overflow-hidden p-4', theme === 'dark' ? 'bg-[#201815] text-[#FFF7E8]' : 'bg-[#F6EAD4] text-[#211A16]')}>
      <AmbientMotifs theme={theme} />
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={cn('absolute right-5 top-5 z-10 rounded-lg border p-2', subtleButton(theme))}>
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <div className="relative z-10 place-self-center">{children}</div>
    </div>
  );
}

function EmptyState({ theme, icon: Icon, title, body, actionLabel, onAction }: { theme: 'light' | 'dark'; icon: LucideIcon; title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className={cn('flex min-h-[320px] flex-col items-center justify-center rounded-lg border p-8 text-center', surface(theme))}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF3C4] text-[#8F4F2E]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-5 text-xl font-bold">{title}</h3>
      <p className={cn('mt-2 max-w-md text-sm leading-6', muted(theme))}>{body}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick, theme }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void; theme: 'light' | 'dark' }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition', active ? 'bg-[#E9B93E] text-[#211A16] shadow-lg shadow-[#8F4F2E]/20' : 'text-[#DED1BF] hover:bg-[#FFF7E8]/10 hover:text-[#FFF7E8]')}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function StatusPill({ state }: { state: AppPost['state'] }) {
  const styles = {
    open: 'bg-[#DBEAFE] text-[#1D4ED8]',
    read_only: 'bg-[#F1F5F9] text-[#475569]',
    locked: 'bg-[#FEE2E2] text-[#B91C1C]',
    archived: 'bg-[#E5E7EB] text-[#374151]',
  };
  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold capitalize', styles[state])}>{state.replace('_', ' ')}</span>;
}

function Avatar({ profile }: { profile?: AppProfile }) {
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={profile.display_name} className="h-9 w-9 rounded-lg object-cover" />;
  }
  return <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF3C4] text-sm font-bold text-[#8F4F2E]">{profile?.display_name?.slice(0, 1).toUpperCase() ?? 'M'}</div>;
}

async function fetchProfiles(userIds: string[]) {
  if (!supabase || userIds.length === 0) return [];

  const profileResult = await supabase
    .from('users')
    .select(PROFILE_SELECT)
    .in('id', userIds);

  if (!profileResult.error) return (profileResult.data ?? []) as AppProfile[];

  const missingProfileColumn = ['phone', 'address', 'bio'].some((column) => profileResult.error.message.includes(column));
  if (!missingProfileColumn) return [];

  const fallbackResult = await supabase
    .from('users')
    .select(BASIC_PROFILE_SELECT)
    .in('id', userIds);

  if (fallbackResult.error) return [];
  return (fallbackResult.data ?? []) as AppProfile[];
}

async function ensureProfile(session: Session) {
  if (!supabase) return;
  const email = session.user.email ?? '';
  const displayName = session.user.user_metadata?.full_name ?? email.split('@')[0] ?? 'Member';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data: existingProfile } = await supabase
    .from('users')
    .select('id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (existingProfile) {
    await supabase
      .from('users')
      .update({ email, timezone })
      .eq('id', session.user.id);
    return;
  }

  await supabase.from('users').insert({
    id: session.user.id,
    email,
    display_name: displayName,
    avatar_url: session.user.user_metadata?.avatar_url ?? null,
    timezone,
  });
}

async function createWorkspace(session: Session, workspaceName: string) {
  if (!supabase) return;
  const email = session.user.email ?? '';
  const displayName = session.user.user_metadata?.full_name ?? email.split('@')[0] ?? 'Member';
  const { error } = await supabase.rpc('create_initial_workspace', {
    workspace_name: workspaceName,
    profile_email: email,
    profile_display_name: displayName,
    profile_avatar_url: session.user.user_metadata?.avatar_url ?? null,
    profile_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  if (!error) return;

  const missingRpc = error.code === 'PGRST202' || error.message.toLowerCase().includes('schema cache');
  if (!missingRpc) throw error;

  await createWorkspaceWithTableInserts(session, workspaceName);
}

async function createWorkspaceWithTableInserts(session: Session, workspaceName: string) {
  if (!supabase) return;
  await ensureProfile(session);

  const slug = `${slugify(workspaceName)}-${crypto.randomUUID().slice(0, 8)}`;
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .insert({ name: workspaceName, slug, owner_id: session.user.id })
    .select('id')
    .single();

  if (workspaceError) throw workspaceError;

  const { error: membershipError } = await supabase
    .from('memberships')
    .insert({ workspace_id: workspace.id, user_id: session.user.id, role: 'owner' });

  if (membershipError) throw membershipError;

  const { error: spaceError } = await supabase.from('spaces').insert({
    workspace_id: workspace.id,
    name: 'General',
    slug: 'general',
    access: 'public',
    created_by: session.user.id,
  });

  if (spaceError) throw spaceError;
}

async function createSpace(workspaceId: string, userId: string, name: string, access: SpaceAccess) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
  const { data, error } = await supabase
    .from('spaces')
    .insert({
      workspace_id: workspaceId,
      name,
      slug,
      access,
      created_by: userId,
    })
    .select('id, workspace_id, name, slug, access, description, archived_at, created_by, created_at, updated_at')
    .single();

  if (error) throw error;
  return data as AppSpace;
}

async function createPost(workspaceId: string, spaceId: string, userId: string, title: string, body: string) {
  if (!supabase) return;
  const { error } = await supabase.from('posts').insert({
    workspace_id: workspaceId,
    space_id: spaceId,
    author_id: userId,
    title,
    body,
  });
  if (error) throw error;
}

async function updatePost(postId: string, input: { title: string; body: string; spaceId: string }) {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('posts')
    .update({
      title: input.title,
      body: input.body,
      space_id: input.spaceId,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The post was not updated. Your account may not have permission to edit it.');
}

async function deletePost(postId: string) {
  if (!supabase) return;
  const { data: attachmentRows } = await supabase
    .from('attachments')
    .select('bucket, object_path')
    .eq('post_id', postId);
  const { data, error } = await supabase.from('posts').delete().eq('id', postId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The post was not deleted. Apply the latest Supabase migration and confirm your account is the author, Chief, or admin.');
  const pathsByBucket = new Map<string, string[]>();
  (attachmentRows ?? []).forEach((attachment) => {
    pathsByBucket.set(attachment.bucket, [...(pathsByBucket.get(attachment.bucket) ?? []), attachment.object_path]);
  });
  await Promise.all([...pathsByBucket].map(([bucket, paths]) => supabase.storage.from(bucket).remove(paths)));
}

async function createComment(post: AppPost, userId: string, body: string, isDecision: boolean, files: File[]) {
  if (!supabase) return;
  const { data: comment, error } = await supabase
    .from('comments')
    .insert({
      workspace_id: post.workspace_id,
      post_id: post.id,
      author_id: userId,
      body,
      is_decision: isDecision,
    })
    .select('id')
    .single();
  if (error) throw error;
  for (const file of files) {
    await uploadCommentAttachment(post, comment.id, userId, file);
  }
}

async function uploadCommentAttachment(post: AppPost, commentId: string, userId: string, file: File) {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name} is larger than 100 MB.`);

  const safeName = sanitizeFilename(file.name);
  const objectPath = `${post.workspace_id}/${userId}/${commentId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from('workspace-files').upload(objectPath, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: attachmentError } = await supabase.from('attachments').insert({
    workspace_id: post.workspace_id,
    post_id: post.id,
    comment_id: commentId,
    uploaded_by: userId,
    bucket: 'workspace-files',
    object_path: objectPath,
    filename: file.name,
    mime_type: file.type || 'application/octet-stream',
    byte_size: file.size,
  });

  if (attachmentError) {
    await supabase.storage.from('workspace-files').remove([objectPath]);
    throw attachmentError;
  }
}

async function uploadAvatar(userId: string, file: File) {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file for your profile photo.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Profile photos must be 10 MB or smaller.');

  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const objectPath = `${userId}/avatar.${extension}`;
  const { error } = await supabase.storage.from('avatars').upload(objectPath, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(objectPath);
  return `${data.publicUrl}?v=${Date.now()}`;
}

async function createTask(
  workspaceId: string,
  userId: string,
  input: { title: string; description: string; assigneeId: string; dueAt: string },
) {
  if (!supabase) return;
  const { error } = await supabase.from('tasks').insert({
    workspace_id: workspaceId,
    title: input.title,
    description: input.description || null,
    assignee_id: input.assigneeId || null,
    created_by: userId,
    status: 'todo',
    due_at: input.dueAt || null,
  });
  if (error) throw error;
}

async function updateTask(
  taskId: string,
  input: { title: string; description: string; assigneeId: string; dueAt: string },
) {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('tasks')
    .update({
      title: input.title,
      description: input.description || null,
      assignee_id: input.assigneeId || null,
      due_at: input.dueAt || null,
    })
    .eq('id', taskId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The task was not updated. Your account may not have permission to edit it.');
}

async function updateTaskStatus(taskId: string, status: TaskStatus) {
  if (!supabase) return;
  const { data, error } = await supabase.from('tasks').update({ status }).eq('id', taskId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The task status was not updated. Your account may not have permission to edit it.');
}

async function deleteTask(taskId: string) {
  if (!supabase) return;
  const { data, error } = await supabase.from('tasks').delete().eq('id', taskId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The task was not deleted. Apply the latest Supabase migration and confirm your account is the creator, assignee, Chief, or admin.');
}

async function updateProfile(
  userId: string,
  input: { displayName: string; avatarUrl: string; phone: string; address: string; timezone: string; bio: string },
) {
  if (!supabase) return;
  const { data, error: basicError } = await supabase
    .from('users')
    .update({
      display_name: input.displayName,
      avatar_url: input.avatarUrl || null,
      timezone: input.timezone || null,
    })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (basicError) throw basicError;
  if (!data) throw new Error('Your profile was not updated. Please sign in again and retry.');

  const { error: detailsError } = await supabase
    .from('users')
    .update({
      phone: input.phone || null,
      address: input.address || null,
      bio: input.bio || null,
    })
    .eq('id', userId);

  if (detailsError && !isMissingProfileDetailsError(detailsError.message)) throw detailsError;
}

async function createWorkspaceInvitation(workspaceId: string, email: string, role: WorkspaceRole) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('create_workspace_invitation', {
    target_workspace_id: workspaceId,
    invitee_email: email,
    invitee_role: role,
  });

  if (error) throw error;

  const url = new URL(window.location.origin);
  url.searchParams.set('invite', String(data));
  return url.toString();
}

async function acceptWorkspaceInvitation(session: Session, inviteToken: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const email = session.user.email ?? '';
  const displayName = session.user.user_metadata?.full_name ?? email.split('@')[0] ?? 'Member';
  const { data, error } = await supabase.rpc('accept_workspace_invitation', {
    invite_token: inviteToken,
    profile_email: email,
    profile_display_name: displayName,
    profile_avatar_url: session.user.user_metadata?.avatar_url ?? null,
    profile_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  if (error) throw error;
  return String(data);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function sanitizeFilename(filename: string) {
  const cleaned = filename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'attachment';
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return 'Something went wrong. Please try again.';
}

function isMissingProfileDetailsError(message: string) {
  const normalized = message.toLowerCase();
  return ['phone', 'address', 'bio'].some((column) => normalized.includes(column));
}

function getRoleLabel(role: WorkspaceRole) {
  const labels: Record<WorkspaceRole, string> = {
    owner: 'Chief',
    admin: 'Admin',
    member: 'Member',
    guest: 'Guest',
  };
  return labels[role];
}

function getTrailAccessLabel(access: SpaceAccess) {
  const labels: Record<SpaceAccess, string> = {
    public: 'public',
    private: 'private',
    invite_only: 'invite-only',
  };
  return labels[access];
}

function getInitialInviteToken() {
  const urlToken = new URLSearchParams(window.location.search).get('invite');
  if (urlToken) return urlToken;
  return window.localStorage.getItem(INVITE_STORAGE_KEY) ?? '';
}

function clearStoredInviteToken() {
  window.localStorage.removeItem(INVITE_STORAGE_KEY);
}

function surface(theme: 'light' | 'dark') {
  return theme === 'dark' ? 'border-white/10 bg-white/[0.06]' : 'border-[#DFC9A4] bg-[#FFFAF0]/88';
}

function subtleButton(theme: 'light' | 'dark') {
  return theme === 'dark' ? 'border-white/10 bg-white/[0.06] hover:bg-white/[0.1]' : 'border-[#DFC9A4] bg-[#FFFAF0]/78 hover:bg-[#FFF3C4]';
}

function muted(theme: 'light' | 'dark') {
  return theme === 'dark' ? 'text-[#DFC9A4]' : 'text-[#74685B]';
}
