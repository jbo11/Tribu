import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  Inbox,
  Loader2,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sun,
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
  AppPost,
  AppProfile,
  AppSpace,
  AppTask,
  AppWorkspace,
  SpaceAccess,
  SortMode,
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

const baybayinWords = [
  { glyph: 'ᜆᜒᜏᜎ', label: 'Tiwala' },
  { glyph: 'ᜊᜒᜌᜌ', label: 'Biyaya' },
  { glyph: 'ᜉᜇᜌᜓᜈ᜔', label: 'Padayon' },
  { glyph: 'ᜉᜓᜑᜓᜈ᜔', label: 'Puhon' },
  { glyph: 'ᜋᜆᜒᜊᜌ᜔', label: 'Matibay' },
  { glyph: 'ᜃᜋᜎᜌᜈ᜔', label: 'Kamalayan' },
  { glyph: 'ᜃᜇᜓᜈᜓᜅᜈ᜔', label: 'Karunungan' },
  { glyph: 'ᜑᜒᜏᜄ', label: 'Hiwaga' },
  { glyph: 'ᜀᜎᜓᜈ᜔', label: 'Alon' },
  { glyph: 'ᜃᜇᜄᜆᜈ᜔', label: 'Karagatan' },
  { glyph: 'ᜑᜓᜋᜎᜒᜅ᜔', label: 'Humaling' },
  { glyph: 'ᜃᜎᜒᜃᜐᜈ᜔', label: 'Kalikasan' },
  { glyph: 'ᜋᜆᜆᜄ᜔', label: 'Matatag' },
  { glyph: 'ᜐᜒᜈᜄ᜔', label: 'Sinag' },
  { glyph: 'ᜆᜎ', label: 'Tala' },
  { glyph: 'ᜎᜒᜃ᜔ᜑ', label: 'Likha' },
  { glyph: 'ᜋᜎᜌ', label: 'Malaya' },
  { glyph: 'ᜄᜓᜈᜒᜆ', label: 'Gunita' },
  { glyph: 'ᜋᜃᜒᜐᜒᜄ᜔', label: 'Makisig' },
  { glyph: 'ᜉᜅᜃᜓ', label: 'Pangako' },
  { glyph: 'ᜉᜇᜎᜓᜋᜈ᜔', label: 'Paraluman' },
  { glyph: 'ᜉᜄ᜔ᜐᜋᜓ', label: 'Pagsamo' },
  { glyph: 'ᜆᜇ᜔ᜑᜈ', label: 'Tadhana' },
];

const baybayinBackdropZones = [
  { x: [2, 12], y: [12, 24] },
  { x: [58, 72], y: [8, 20] },
  { x: [8, 20], y: [58, 70] },
  { x: [66, 80], y: [60, 74] },
];

const INVITE_STORAGE_KEY = 'tribu_invite_token';

type BaybayinBackdropItem = {
  glyph: string;
  left: number;
  top: number;
  rotate: number;
  size: number;
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createBaybayinBackdropItems(): BaybayinBackdropItem[] {
  const startIndex = Math.floor(Math.random() * baybayinWords.length);

  return baybayinBackdropZones.map((zone, index) => {
    const word = baybayinWords[(startIndex + index * 4) % baybayinWords.length];
    return {
      glyph: word.glyph,
      left: randomBetween(zone.x[0], zone.x[1]),
      top: randomBetween(zone.y[0], zone.y[1]),
      rotate: randomBetween(-8, 8),
      size: randomBetween(6.5, 9),
    };
  });
}

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
  const [profiles, setProfiles] = useState<Record<string, AppProfile>>({});
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState(getInitialInviteToken);
  const [inviteAcceptError, setInviteAcceptError] = useState('');

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? posts[0];
  const selectedProfile = selectedPost ? profiles[selectedPost.author_id] : undefined;

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

  const loadWorkspaceData = useCallback(async (targetWorkspaceId: string) => {
    if (!supabase || !targetWorkspaceId) return;
    setLoading(true);
    setNotice('');

    const [spaceResult, postResult, taskResult] = await Promise.all([
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
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

    if (spaceResult.error) setNotice(spaceResult.error.message);
    if (postResult.error) setNotice(postResult.error.message);
    if (taskResult.error) setNotice(taskResult.error.message);

    const nextSpaces = (spaceResult.data ?? []) as AppSpace[];
    const nextPosts = ((postResult.data ?? []) as AppPost[]).map((post) => ({ ...post, has_decision: false }));
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

    if (profileIds.size > 0) {
      const profileResult = await supabase
        .from('users')
        .select('id, email, display_name, avatar_url, timezone')
        .in('id', [...profileIds]);

      if (!profileResult.error) {
        setProfiles(Object.fromEntries(((profileResult.data ?? []) as AppProfile[]).map((profile) => [profile.id, profile])));
      }
    } else {
      setProfiles({});
    }

    setLoading(false);
  }, []);

  const loadMemberships = useCallback(async (preferredWorkspaceId?: string) => {
    if (!supabase) return;

    const membershipResult = await supabase
      .from('memberships')
      .select('workspace_id, role')
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

        await loadMemberships(acceptedWorkspaceId);
      } catch (caughtError) {
        const message = getErrorMessage(caughtError);
        if (inviteToken) setInviteAcceptError(message);
        else setNotice(message);
        setLoading(false);
      }
    })();
  }, [authReady, inviteToken, loadMemberships, session]);

  useEffect(() => {
    if (!supabase || !workspaceId) return;

    const channel = supabase
      .channel(`workspace-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: `workspace_id=eq.${workspaceId}` }, () => {
        void loadWorkspaceData(workspaceId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `workspace_id=eq.${workspaceId}` }, () => {
        void loadWorkspaceData(workspaceId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadWorkspaceData, workspaceId]);

  useEffect(() => {
    if (!supabase || !selectedPost?.id) {
      setComments([]);
      return;
    }

    supabase
      .from('comments')
      .select('id, workspace_id, post_id, parent_comment_id, author_id, body, is_decision, created_at, updated_at')
      .eq('post_id', selectedPost.id)
      .order('created_at', { ascending: true })
      .then(async ({ data, error }) => {
        if (error) {
          setNotice(error.message);
          return;
        }

        const nextComments = (data ?? []) as AppComment[];
        setComments(nextComments);

        const authorIds = [...new Set(nextComments.map((comment) => comment.author_id))];
        if (authorIds.length) {
          const profileResult = await supabase
            .from('users')
            .select('id, email, display_name, avatar_url, timezone')
            .in('id', authorIds);

          if (!profileResult.error) {
            setProfiles((current) => ({
              ...current,
              ...Object.fromEntries(((profileResult.data ?? []) as AppProfile[]).map((profile) => [profile.id, profile])),
            }));
          }
        }
      });
  }, [selectedPost?.id]);

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
          await loadMemberships();
        }}
      />
    );
  }

  return (
    <div className={cn('relative h-dvh overflow-hidden font-sans', theme === 'dark' ? 'bg-[#201815] text-[#FFF7E8]' : 'bg-[#F6EAD4] text-[#211A16]')}>
      <AmbientMotifs theme={theme} />
      <BaybayinBackdrop theme={theme} />
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
          onSignOut={() => void supabase?.auth.signOut()}
          themeToggle={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
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

              {view === 'tasks' && <TasksView tasks={tasks} profiles={profiles} theme={theme} />}
              {view === 'knowledge' && <KnowledgeView theme={theme} />}
              {view === 'admin' && (
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
              profiles={profiles}
              theme={theme}
              onReply={async (body, isDecision) => {
                if (!selectedPost || !session.user) return;
                await createComment(selectedPost, session.user.id, body, isDecision);
                await loadWorkspaceData(workspaceId);
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
            await loadWorkspaceData(workspaceId);
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
            await loadWorkspaceData(workspaceId);
            setActiveSpaceId(space.id);
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

function BaybayinBackdrop({ theme, className = '' }: { theme: 'light' | 'dark'; className?: string }) {
  const [items, setItems] = useState<BaybayinBackdropItem[]>(() => createBaybayinBackdropItems());
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let timeoutId: number | undefined;
    const intervalId = window.setInterval(() => {
      setVisible(false);
      timeoutId = window.setTimeout(() => {
        setItems(createBaybayinBackdropItems());
        setVisible(true);
      }, 1400);
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className={cn('pointer-events-none absolute inset-0 z-0 hidden overflow-hidden md:block', theme === 'dark' ? 'text-[#FFF7E8]/5' : 'text-[#211A16]/5', className)} aria-hidden="true">
      {items.map((item, index) => (
        <span
          key={`${item.glyph}-${index}`}
          className={cn('absolute font-serif font-semibold leading-none tracking-[0.02em] transition-opacity duration-1000 ease-in-out', visible ? 'opacity-100' : 'opacity-0')}
          style={{
            left: `${item.left}%`,
            top: `${item.top}%`,
            transform: `rotate(${item.rotate}deg)`,
            fontSize: `clamp(${item.size}rem, ${item.size * 1.6}vw, ${item.size + 4}rem)`,
          }}
        >
          {item.glyph}
        </span>
      ))}
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
  onSignOut,
  themeToggle,
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
  onSignOut: () => void;
  themeToggle: () => void;
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
          <NavButton icon={ShieldCheck} label="Admin" active={view === 'admin'} onClick={() => onViewChange('admin')} theme={theme} />
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
          <button onClick={themeToggle} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#FFF7E8]/15 bg-[#FFF7E8]/8 text-sm font-semibold text-[#FFF7E8]">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Theme
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
}: {
  post: AppPost;
  selected: boolean;
  profile?: AppProfile;
  theme: 'light' | 'dark';
  space?: AppSpace;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn('w-full rounded-lg border p-4 text-left transition', selected ? 'border-[#E9B93E] shadow-lg shadow-[#8F4F2E]/15' : surface(theme))}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill state={post.state} />
        {space && <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', theme === 'dark' ? 'bg-white/10 text-[#DFC9A4]' : 'bg-[#E4F1F3] text-[#185C74]')}>{space.name}</span>}
        <span className={cn('ml-auto text-xs', muted(theme))}>{formatTimeAgo(post.last_activity_at)}</span>
      </div>
      <h2 className="mt-3 text-lg font-bold tracking-tight">{post.title}</h2>
      <p className={cn('mt-2 line-clamp-2 text-sm leading-6', muted(theme))}>{post.body}</p>
      <div className="mt-4 flex items-center gap-3">
        <Avatar profile={profile} />
        <span className="text-sm font-semibold">{profile?.display_name ?? 'Camp member'}</span>
      </div>
    </button>
  );
}

function ThreadPanel({
  post,
  profile,
  comments,
  profiles,
  theme,
  onReply,
}: {
  post?: AppPost;
  profile?: AppProfile;
  comments: AppComment[];
  profiles: Record<string, AppProfile>;
  theme: 'light' | 'dark';
  onReply: (body: string, isDecision: boolean) => Promise<void>;
}) {
  const [reply, setReply] = useState('');
  const [isDecision, setIsDecision] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
          <button aria-label="Archive post" className={cn('rounded-lg border p-2', subtleButton(theme))}>
            <Archive className="h-4 w-4" />
          </button>
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
              />
            </div>
          ))}
        </div>
      </div>

      <form
        className={cn('shrink-0 border-t p-4', theme === 'dark' ? 'border-white/10 bg-[#201815]' : 'border-[#DFC9A4] bg-[#F6EAD4]')}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!reply.trim()) return;
          setSubmitting(true);
          await onReply(reply.trim(), isDecision);
          setReply('');
          setIsDecision(false);
          setSubmitting(false);
        }}
      >
        <textarea
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          placeholder="Reply to this post"
          className={cn('h-24 w-full resize-none rounded-lg border bg-transparent p-3 text-sm leading-6 outline-none', subtleButton(theme))}
        />
        <div className="mt-3 flex items-center gap-3">
          <label className={cn('flex items-center gap-2 text-sm', muted(theme))}>
            <input type="checkbox" checked={isDecision} onChange={(event) => setIsDecision(event.target.checked)} className="h-4 w-4 accent-[#8F4F2E]" />
            Decision
          </label>
          <button disabled={submitting || !reply.trim()} className="ml-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Reply
          </button>
        </div>
      </form>
    </aside>
  );
}

function ThreadCard({ profile, body, timestamp, theme, isDecision }: { profile?: AppProfile; body: string; timestamp: string; theme: 'light' | 'dark'; isDecision?: boolean }) {
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
      <p className={cn('whitespace-pre-wrap text-sm leading-6', muted(theme))}>{body}</p>
    </div>
  );
}

function TasksView({ tasks, profiles, theme }: { tasks: AppTask[]; profiles: Record<string, AppProfile>; theme: 'light' | 'dark' }) {
  if (tasks.length === 0) {
    return <EmptyState theme={theme} icon={ClipboardList} title="No tasks yet" body="Tasks created from discussions will appear here." />;
  }

  return (
    <StaticPanel theme={theme} title="Tasks" icon={ClipboardList}>
      <div className="grid gap-3">
        {tasks.slice(0, 8).map((task) => (
          <div key={task.id} className={cn('grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_150px_110px]', surface(theme))}>
            <p className="font-semibold">{task.title}</p>
            <p className={cn('text-sm', muted(theme))}>{task.assignee_id ? profiles[task.assignee_id]?.display_name ?? 'Assigned' : 'Unassigned'}</p>
            <p className="w-fit rounded-full bg-[#FFF3C4] px-2.5 py-1 text-xs font-semibold capitalize text-[#8F4F2E]">{task.status.replace('_', ' ')}</p>
          </div>
        ))}
      </div>
    </StaticPanel>
  );
}

function KnowledgeView({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <StaticPanel theme={theme} title="Knowledge" icon={FileText}>
      <EmptyState theme={theme} icon={FileText} title="No knowledge entries yet" body="Posts converted into documentation will appear here after the knowledge workflow is enabled." />
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
  onClose,
  onCreate,
}: {
  theme: 'light' | 'dark';
  spaces: AppSpace[];
  defaultSpaceId: string;
  onClose: () => void;
  onCreate: (input: { title: string; body: string; spaceId: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [spaceId, setSpaceId] = useState(defaultSpaceId);
  const [submitting, setSubmitting] = useState(false);

  return (
    <ModalShell theme={theme} title="New post" onClose={onClose}>
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
          Publish
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

function ModalShell({ theme, title, children, onClose }: { theme: 'light' | 'dark'; title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4">
      <div className={cn('w-full max-w-lg rounded-xl border p-5 shadow-2xl', theme === 'dark' ? 'border-white/10 bg-[#201815]' : 'border-[#DFC9A4] bg-[#FFFAF0]')}>
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
            : 'Chiefs, Admins, Members, and Guests all sign in with their camp email.'}
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

  return (
    <CenteredScreen theme={theme} setTheme={setTheme}>
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E9B93E] text-[#211A16] shadow-lg shadow-[#8F4F2E]/20">
          <TribuLogo className="h-12 w-12" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Create your Chief account</h1>
        <p className={cn('mt-3 text-sm leading-6', muted(theme))}>
          Signed in as {email}. Creating a camp makes this account the Chief, then you can invite Admins, Members, and Guests.
        </p>
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
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Camp name" className={cn('h-12 rounded-lg border bg-transparent px-4 outline-none', subtleButton(theme))} />
          <button disabled={submitting || !name.trim()} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create camp as Chief
          </button>
          <button type="button" onClick={onSignOut} className={cn('inline-flex h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold', subtleButton(theme))}>
            Use a different email
          </button>
          {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}
        </form>
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
      <BaybayinBackdrop theme={theme} />
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

async function ensureProfile(session: Session) {
  if (!supabase) return;
  const email = session.user.email ?? '';
  const displayName = session.user.user_metadata?.full_name ?? email.split('@')[0] ?? 'Member';

  await supabase.from('users').upsert({
    id: session.user.id,
    email,
    display_name: displayName,
    avatar_url: session.user.user_metadata?.avatar_url ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

async function createComment(post: AppPost, userId: string, body: string, isDecision: boolean) {
  if (!supabase) return;
  const { error } = await supabase.from('comments').insert({
    workspace_id: post.workspace_id,
    post_id: post.id,
    author_id: userId,
    body,
    is_decision: isDecision,
  });
  if (error) throw error;
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return 'Something went wrong. Please try again.';
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
