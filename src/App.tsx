import { lazy, Suspense, type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bug,
  Camera,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Copy,
  Download,
  File as FileIcon,
  FileText,
  Filter,
  Globe2,
  Headphones,
  Image as ImageIcon,
  Inbox,
  Info,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Palette,
  Pencil,
  Phone,
  Plus,
  Reply as ReplyIcon,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Smile,
  Sticker,
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
  AppLinkPreview,
  AppMembership,
  AppReaction,
  AppPost,
  AppProfile,
  AppSpace,
  AppTask,
  AppWorkspace,
  KnowledgeArticle,
  KnowledgeCategory,
  SpaceAccess,
  SortMode,
  TaskPriority,
  TaskStatus,
  ViewMode,
  WorkspaceRole,
} from './types';

const sortOptions: { value: SortMode; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'newest', label: 'Newest' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'archived', label: 'Archived' },
];

const workspaceRoles: { role: WorkspaceRole; detail: string }[] = [
  { role: 'owner', detail: 'Camp ownership, billing, security, and deletion.' },
  { role: 'admin', detail: 'Members, trails, integrations, policies, and audit visibility.' },
  { role: 'member', detail: 'Posts, replies, files, tasks, and camp search.' },
  { role: 'guest', detail: 'Only invited trails and assigned work.' },
];

const knowledgeCategories: { value: KnowledgeCategory; label: string }[] = [
  { value: 'documentation', label: 'Documentation' },
  { value: 'how_to', label: 'How-to guide' },
  { value: 'faq', label: 'FAQ' },
  { value: 'best_practice', label: 'Best practice' },
  { value: 'troubleshooting', label: 'Troubleshooting' },
  { value: 'sop', label: 'Standard operating procedure' },
];

const INVITE_STORAGE_KEY = 'tribu_invite_token';
const BASIC_PROFILE_SELECT = 'id, email, display_name, avatar_url, timezone';
const PROFILE_SELECT = 'id, email, display_name, full_name, nickname, avatar_url, timezone, phone, address, bio';
const linkPreviewCache = new Map<string, AppLinkPreview>();
const THREAD_WIDTH_STORAGE_KEY = 'tribu_thread_width';
const THEME_STORAGE_KEY = 'tribu_theme';
const CHAT_OPEN_STORAGE_KEY = 'tribu_chat_open';
const EmojiPicker = lazy(() => import('emoji-picker-react'));

interface ForwardableMessage {
  body: string;
  attachments: AppAttachment[];
}

type AccountModalView = 'personalization' | 'profile' | 'settings' | 'help' | 'about';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
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
  const [reactions, setReactions] = useState<AppReaction[]>([]);
  const [profiles, setProfiles] = useState<Record<string, AppProfile>>({});
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [memberships, setMemberships] = useState<AppMembership[]>([]);
  const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticle[]>([]);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [accountModal, setAccountModal] = useState<AccountModalView | null>(null);
  const [editingPost, setEditingPost] = useState<AppPost | null>(null);
  const [editingTask, setEditingTask] = useState<AppTask | null>(null);
  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  const [editingKnowledgeArticle, setEditingKnowledgeArticle] = useState<KnowledgeArticle | null>(null);
  const [inviteToken, setInviteToken] = useState(getInitialInviteToken);
  const [inviteAcceptError, setInviteAcceptError] = useState('');
  const [threadWidth, setThreadWidth] = useState(getInitialThreadWidth);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatOnOtherPages, setChatOnOtherPages] = useState(getInitialChatOpen);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const currentRole = selectedWorkspace?.role;
  const canManageAdmin = currentRole === 'owner' || currentRole === 'admin';
  const showThreadPanel = chatOpen;
  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? posts[0];
  const selectedProfile = selectedPost ? profiles[selectedPost.author_id] : undefined;
  const currentProfile = session?.user.id ? profiles[session.user.id] : undefined;
  const memberProfiles = useMemo(
    () => (Object.values(profiles) as AppProfile[]).sort((a, b) => getProfileName(a).localeCompare(getProfileName(b))),
    [profiles],
  );

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_OPEN_STORAGE_KEY, String(chatOnOtherPages));
  }, [chatOnOtherPages]);

  const visiblePosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const base = posts.filter((post) => {
      if (sort === 'archived') return post.state === 'archived';
      if (post.state === 'archived') return false;
      if (sort === 'assigned') return post.metadata?.assigned_to === session?.user.id;
      return true;
    });

    const searched = normalizedQuery
      ? base.filter((post) => `${post.title} ${post.body}`.toLowerCase().includes(normalizedQuery))
      : base;

    return [...searched].sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
    });
  }, [posts, query, session?.user.id, sort]);

  const loadWorkspaceData = useCallback(async (targetWorkspaceId: string, silent = false) => {
    if (!supabase || !targetWorkspaceId) return;
    if (!silent) setLoading(true);
    setNotice('');

    const [spaceResult, postResult, taskResult, membershipResult, knowledgeResult] = await Promise.all([
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
        .select('id, workspace_id, post_id, title, description, project_name, priority, tags, assignee_id, created_by, status, due_at, archived_at, created_at, updated_at')
        .eq('workspace_id', targetWorkspaceId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('memberships')
        .select('id, workspace_id, user_id, role, joined_at')
        .eq('workspace_id', targetWorkspaceId),
      supabase
        .from('knowledge_articles')
        .select('id, workspace_id, category, title, summary, content, created_by, created_at, updated_at')
        .eq('workspace_id', targetWorkspaceId)
        .order('updated_at', { ascending: false }),
    ]);

    if (spaceResult.error) setNotice(spaceResult.error.message);
    if (postResult.error) setNotice(postResult.error.message);
    if (taskResult.error) setNotice(taskResult.error.message);
    if (membershipResult.error) setNotice(membershipResult.error.message);
    if (knowledgeResult.error) setNotice(knowledgeResult.error.message);

    const nextSpaces = (spaceResult.data ?? []) as AppSpace[];
    const nextPosts = (postResult.data ?? []) as AppPost[];
    const nextTasks = (taskResult.data ?? []) as AppTask[];
    const nextMemberships = (membershipResult.data ?? []) as AppMembership[];
    const nextKnowledgeArticles = (knowledgeResult.data ?? []) as KnowledgeArticle[];

    setSpaces(nextSpaces);
    setPosts(nextPosts);
    setTasks(nextTasks);
    setMemberships(nextMemberships);
    setKnowledgeArticles(nextKnowledgeArticles);
    setSelectedPostId((current) => current || nextPosts[0]?.id || '');
    setActiveSpaceId((current) => (current === 'all' || nextSpaces.some((space) => space.id === current) ? current : 'all'));

    const profileIds = new Set<string>();
    nextPosts.forEach((post) => profileIds.add(post.author_id));
    nextTasks.forEach((task) => {
      if (task.assignee_id) profileIds.add(task.assignee_id);
      profileIds.add(task.created_by);
    });
    nextKnowledgeArticles.forEach((article) => profileIds.add(article.created_by));
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
      setReactions([]);
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
    const commentIds = nextComments.map((comment) => comment.id);
    const reactionFilter = commentIds.length > 0
      ? `post_id.eq.${postId},comment_id.in.(${commentIds.join(',')})`
      : `post_id.eq.${postId}`;
    const reactionResult = await supabase
      .from('reactions')
      .select('id, workspace_id, post_id, comment_id, user_id, emoji, created_at')
      .or(reactionFilter)
      .order('created_at', { ascending: true });
    if (reactionResult.error) {
      setNotice(reactionResult.error.message);
      return;
    }

    setComments(nextComments);
    const nextAttachments = await Promise.all(
      ((attachmentResult.data ?? []) as AppAttachment[]).map(async (attachment) => {
        const { data } = await supabase.storage.from(attachment.bucket).createSignedUrl(attachment.object_path, 3600);
        return { ...attachment, signed_url: data?.signedUrl };
      }),
    );
    setAttachments(nextAttachments);
    setReactions((reactionResult.data ?? []) as AppReaction[]);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `workspace_id=eq.${workspaceId}` }, () => {
        if (selectedPost?.id) void loadComments(selectedPost.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${workspaceId}` }, () => {
        void loadWorkspaceData(workspaceId, true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge_articles', filter: `workspace_id=eq.${workspaceId}` }, () => {
        void loadWorkspaceData(workspaceId, true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memberships', filter: `workspace_id=eq.${workspaceId}` }, () => {
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
      setReactions([]);
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
            setChatOpen(nextView === 'feed' ? true : chatOnOtherPages);
            setSidebarOpen(false);
          }}
          workspaces={workspaces}
          workspaceId={workspaceId}
          sidebarOpen={sidebarOpen}
          profile={currentProfile}
          email={session.user.email ?? ''}
          plan={selectedWorkspace?.plan ?? 'free'}
          onClose={() => setSidebarOpen(false)}
          onCreateSpace={() => setSpaceModalOpen(true)}
          onOpenAccount={setAccountModal}
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
              {!chatOpen && (
                <button type="button" aria-label="Toggle side panel" title="Toggle side panel" onClick={() => setChatOpen(true)} className={cn('inline-flex h-11 w-11 items-center justify-center rounded-lg border', surface(theme))}>
                  <PanelRightOpen className="h-4 w-4" />
                </button>
              )}
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

          <div
            className={cn('grid min-h-0 grid-cols-1 overflow-hidden', showThreadPanel && 'xl:grid-cols-[minmax(0,1fr)_var(--thread-width)]')}
            style={{ '--thread-width': `${threadWidth}%` } as CSSProperties}
          >
            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden px-4 py-5 md:px-6">
              {notice && (
                <div className="mb-4 rounded-lg border border-[#E9B93E] bg-[#FFF3C4] px-4 py-3 text-sm text-[#8F4F2E]">
                  {notice}
                </div>
              )}

              {view === 'feed' && (
                <>
                  <Metrics posts={posts} tasks={tasks} knowledgeCount={knowledgeArticles.length} theme={theme} />
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
                              members={memberProfiles}
                              onClick={() => {
                                setSelectedPostId(post.id);
                                setChatOpen(true);
                              }}
                              canManage={post.author_id === session.user.id || canManageAdmin}
                              onEdit={() => setEditingPost(post)}
                              onAssign={async (assigneeId) => {
                                try {
                                  await assignPost(post.id, assigneeId);
                                  await loadWorkspaceData(workspaceId, true);
                                } catch (caughtError) {
                                  setNotice(getErrorMessage(caughtError));
                                }
                              }}
                              onArchive={async () => {
                                try {
                                  await setPostArchived(post.id, post.state !== 'archived');
                                  if (selectedPostId === post.id) setSelectedPostId('');
                                  await loadWorkspaceData(workspaceId, true);
                                } catch (caughtError) {
                                  setNotice(getErrorMessage(caughtError));
                                }
                              }}
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
                  canManageTaskActions={canManageAdmin}
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
                  onArchiveTask={async (task) => {
                    try {
                      await archiveTask(task.id);
                      await loadWorkspaceData(workspaceId, true);
                    } catch (caughtError) {
                      setNotice(getErrorMessage(caughtError));
                    }
                  }}
                />
              )}
              {view === 'knowledge' && (
                <KnowledgeView
                  articles={knowledgeArticles}
                  profiles={profiles}
                  theme={theme}
                  canManage={canManageAdmin}
                  onCreate={() => setKnowledgeModalOpen(true)}
                  onEdit={(article) => setEditingKnowledgeArticle(article)}
                  onDelete={async (article) => {
                    if (!window.confirm('Delete this knowledge article?')) return;
                    try {
                      await deleteKnowledgeArticle(article.id);
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
                  memberships={memberships}
                  profiles={profiles}
                  onInvite={(email, role) => createWorkspaceInvitation(workspaceId, email, role)}
                  onRoleChange={async (membershipId, role) => {
                    await updateMemberRole(membershipId, role);
                    await loadWorkspaceData(workspaceId, true);
                  }}
                />
              )}
            </section>

            {showThreadPanel && <ThreadPanel
              post={selectedPost}
              profile={selectedProfile}
              comments={comments}
              attachments={attachments}
              reactions={reactions}
              recentPosts={posts.filter((item) => item.state === 'open' && item.id !== selectedPost?.id)}
              profiles={profiles}
              theme={theme}
              currentUserId={session.user.id}
              canManage={canManageAdmin}
              width={threadWidth}
              onWidthChange={(width) => {
                const nextWidth = clampThreadWidth(width);
                setThreadWidth(nextWidth);
                window.localStorage.setItem(THREAD_WIDTH_STORAGE_KEY, String(nextWidth));
              }}
              onClose={() => setChatOpen(false)}
              canClose
              onReply={async (body, files, parentCommentId) => {
                if (!selectedPost || !session.user) return;
                await createComment(selectedPost, session.user.id, body, false, files, parentCommentId);
                await loadWorkspaceData(workspaceId, true);
                await loadComments(selectedPost.id);
              }}
              onReact={async (commentId, emoji) => {
                if (!selectedPost || !session.user) return;
                await toggleReaction(selectedPost, commentId, session.user.id, emoji);
                await loadComments(selectedPost.id);
              }}
              onDeleteComment={async (commentId) => {
                if (!selectedPost) return;
                await deleteComment(commentId);
                await loadComments(selectedPost.id);
              }}
              onForward={async (messageIds, targetPostIds) => {
                if (!selectedPost || !session.user) return;
                const sourceMessages = messageIds.map((messageId) => {
                  if (messageId === selectedPost.id) {
                    return {
                      body: selectedPost.body,
                      attachments: attachments.filter((attachment) => !attachment.comment_id),
                    };
                  }
                  const comment = comments.find((item) => item.id === messageId);
                  if (!comment) return null;
                  return {
                    body: comment.body,
                    attachments: attachments.filter((attachment) => attachment.comment_id === comment.id),
                  };
                }).filter((message): message is ForwardableMessage => Boolean(message));
                const targets = posts.filter((item) => targetPostIds.includes(item.id));
                await forwardMessages(targets, sourceMessages, session.user.id);
                await loadWorkspaceData(workspaceId, true);
              }}
            />}
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
          onCreate={async ({ title, description, projectName, priority, tags, assigneeId, dueAt }) => {
            if (!session.user) return;
            await createTask(workspaceId, session.user.id, { title, description, projectName, priority, tags, assigneeId, dueAt });
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
          onCreate={async ({ title, description, projectName, priority, tags, assigneeId, dueAt }) => {
            await updateTask(editingTask.id, { title, description, projectName, priority, tags, assigneeId, dueAt });
            setEditingTask(null);
            await loadWorkspaceData(workspaceId, true);
          }}
        />
      )}

      {knowledgeModalOpen && (
        <KnowledgeArticleModal
          theme={theme}
          onClose={() => setKnowledgeModalOpen(false)}
          onSave={async (input) => {
            await createKnowledgeArticle(workspaceId, session.user.id, input);
            setKnowledgeModalOpen(false);
            await loadWorkspaceData(workspaceId, true);
          }}
        />
      )}

      {editingKnowledgeArticle && (
        <KnowledgeArticleModal
          theme={theme}
          article={editingKnowledgeArticle}
          onClose={() => setEditingKnowledgeArticle(null)}
          onSave={async (input) => {
            await updateKnowledgeArticle(editingKnowledgeArticle.id, input);
            setEditingKnowledgeArticle(null);
            await loadWorkspaceData(workspaceId, true);
          }}
        />
      )}

      {accountModal && (
        <SettingsModal
          section={accountModal}
          theme={theme}
          setTheme={setTheme}
          chatOpen={chatOnOtherPages}
          setChatOpen={(open) => {
            setChatOnOtherPages(open);
            if (view !== 'feed') setChatOpen(open);
          }}
          profile={currentProfile}
          email={session.user.email ?? ''}
          workspace={selectedWorkspace}
          role={currentRole}
          onClose={() => setAccountModal(null)}
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
  profile,
  email,
  plan,
  onClose,
  onCreateSpace,
  onOpenAccount,
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
  profile?: AppProfile;
  email: string;
  plan: string;
  onClose: () => void;
  onCreateSpace: () => void;
  onOpenAccount: (view: AccountModalView) => void;
  onSignOut: () => void;
  canManageAdmin: boolean;
}) {
  const currentRole = workspaces.find((workspace) => workspace.id === workspaceId)?.role;
  const canManageSpaces = currentRole === 'owner' || currentRole === 'admin';
  const currentRoleLabel = currentRole ? getRoleLabel(currentRole) : 'camp';
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountName = getProfileName(profile, email.split('@')[0] || 'Camp member');
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
        setHelpMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [accountMenuOpen]);

  const openAccountView = (nextView: AccountModalView) => {
    setAccountMenuOpen(false);
    setHelpMenuOpen(false);
    onOpenAccount(nextView);
  };

  return (
    <>
      <div className={cn('fixed inset-0 z-40 bg-black/30 lg:hidden', sidebarOpen ? 'block' : 'hidden')} onClick={onClose} />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-dvh w-[280px] flex-col overflow-visible border-r px-4 py-5 transition-transform lg:static lg:z-auto lg:translate-x-0',
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

        <div ref={accountMenuRef} className="relative mt-auto pt-4">
          {accountMenuOpen && (
            <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-[70] rounded-lg border border-white/10 bg-[#2A2421] p-2 text-[#FFF7E8] shadow-2xl">
              <div className="flex items-center gap-3 border-b border-white/10 px-2 pb-3 pt-1">
                <Avatar profile={profile} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{accountName}</p>
                  <p className="text-xs text-[#BFB3A4]">{planLabel}</p>
                </div>
              </div>
              <div className="mt-2 grid gap-1">
                <AccountMenuButton icon={Palette} label="Personalization" onClick={() => openAccountView('personalization')} />
                <AccountMenuButton icon={User} label="Profile" onClick={() => openAccountView('profile')} />
                <AccountMenuButton icon={Settings} label="Settings" onClick={() => openAccountView('settings')} />
                <div className="relative">
                  <AccountMenuButton icon={CircleHelp} label="Help" trailing={ChevronRight} active={helpMenuOpen} onClick={() => setHelpMenuOpen((open) => !open)} />
                  {helpMenuOpen && (
                    <>
                      <div className="mt-1 grid gap-1 border-t border-white/10 pt-1 lg:hidden">
                        <AccountMenuButton icon={CircleHelp} label="Help center" onClick={() => openAccountView('help')} />
                        <AccountMenuButton icon={Info} label="About Tribu" onClick={() => openAccountView('about')} />
                        <a href="https://github.com/jbo11/Tribu/issues/new" target="_blank" rel="noreferrer" className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition hover:bg-white/10">
                          <Bug className="h-4 w-4" /> Report a problem
                        </a>
                      </div>
                      <div className="absolute bottom-0 left-[calc(100%+0.75rem)] hidden w-56 gap-1 rounded-lg border border-white/10 bg-[#2A2421] p-2 shadow-2xl lg:grid">
                        <AccountMenuButton icon={CircleHelp} label="Help center" onClick={() => openAccountView('help')} />
                        <AccountMenuButton icon={Info} label="About Tribu" onClick={() => openAccountView('about')} />
                        <a href="https://github.com/jbo11/Tribu/issues/new" target="_blank" rel="noreferrer" className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition hover:bg-white/10">
                          <Bug className="h-4 w-4" /> Report a problem
                        </a>
                      </div>
                    </>
                  )}
                </div>
                <div className="my-1 border-t border-white/10" />
                <AccountMenuButton icon={LogOut} label="Log out" onClick={onSignOut} />
              </div>
            </div>
          )}
          <button
            type="button"
            aria-label="Open account menu"
            aria-expanded={accountMenuOpen}
            onClick={() => {
              setAccountMenuOpen((open) => !open);
              setHelpMenuOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-lg border border-[#FFF7E8]/15 bg-[#FFF7E8]/8 p-2 text-left text-[#FFF7E8] transition hover:bg-[#FFF7E8]/12"
          >
            <Avatar profile={profile} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{accountName}</p>
              <p className="text-xs text-[#DFC9A4]">{planLabel}</p>
            </div>
            <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', accountMenuOpen && '-rotate-90')} />
          </button>
        </div>
      </aside>
    </>
  );
}

function Metrics({ posts, tasks, knowledgeCount, theme }: { posts: AppPost[]; tasks: AppTask[]; knowledgeCount: number; theme: 'light' | 'dark' }) {
  const openPosts = posts.filter((post) => post.state === 'open').length;
  const openTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled').length;

  return (
    <div className="grid shrink-0 gap-3 sm:grid-cols-3">
      <MetricCard label="Open posts" value={openPosts} theme={theme} />
      <MetricCard label="Knowledge" value={knowledgeCount} theme={theme} />
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
  members,
  onClick,
  canManage,
  onEdit,
  onAssign,
  onArchive,
  onDelete,
}: {
  post: AppPost;
  selected: boolean;
  profile?: AppProfile;
  theme: 'light' | 'dark';
  space?: AppSpace;
  members: AppProfile[];
  onClick: () => void;
  canManage: boolean;
  onEdit: () => void;
  onAssign: (assigneeId: string) => Promise<void>;
  onArchive: () => Promise<void>;
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
          <span className="truncate text-sm font-semibold">{getProfileName(profile)}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <label className="sr-only" htmlFor={`assignee-${post.id}`}>Assign post</label>
          <select
            id={`assignee-${post.id}`}
            value={typeof post.metadata?.assigned_to === 'string' ? post.metadata.assigned_to : ''}
            disabled={post.state === 'archived'}
            title="Assign post"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              event.stopPropagation();
              void onAssign(event.target.value);
            }}
            className={cn('h-9 max-w-40 rounded-lg border px-2 text-xs font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-60', subtleButton(theme))}
          >
            <option value="">All</option>
            {members.map((member) => <option key={member.id} value={member.id}>{getProfileName(member)}</option>)}
          </select>
          <button
            type="button"
            aria-label={post.state === 'archived' ? 'Restore post' : 'Archive post'}
            title={post.state === 'archived' ? 'Restore post' : 'Archive post'}
            onClick={(event) => {
              event.stopPropagation();
              void onArchive();
            }}
            className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg border', subtleButton(theme))}
          >
            {post.state === 'archived' ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </button>
          {canManage && (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadPanel({
  post,
  profile,
  comments,
  attachments,
  reactions,
  recentPosts,
  profiles,
  theme,
  currentUserId,
  canManage,
  width,
  onWidthChange,
  onClose,
  canClose,
  onReply,
  onReact,
  onDeleteComment,
  onForward,
}: {
  post?: AppPost;
  profile?: AppProfile;
  comments: AppComment[];
  attachments: AppAttachment[];
  reactions: AppReaction[];
  recentPosts: AppPost[];
  profiles: Record<string, AppProfile>;
  theme: 'light' | 'dark';
  currentUserId: string;
  canManage: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  canClose: boolean;
  onReply: (body: string, files: File[], parentCommentId: string | null) => Promise<void>;
  onReact: (commentId: string | null, emoji: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onForward: (messageIds: string[], targetPostIds: string[]) => Promise<void>;
}) {
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<AppComment | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const latestMessageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [post?.id, comments.length, attachments.length, reactions.length]);

  useEffect(() => {
    setForwarding(false);
    setForwardModalOpen(false);
    setSelectedMessageIds(new Set());
  }, [post?.id]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!attachmentMenuRef.current?.contains(event.target as Node)) setAttachmentMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [attachmentMenuOpen]);

  const addFiles = (incoming: FileList | File[]) => {
    const accepted = Array.from(incoming).filter((file) => file.size <= 100 * 1024 * 1024);
    setFiles((current) => [...current, ...accepted].slice(0, 10));
    if (accepted.length !== Array.from(incoming).length) setError('Each attachment must be 100 MB or smaller.');
  };

  const openFilePicker = (accept: string, capture = false) => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  };

  const beginForward = (messageId: string) => {
    setForwarding(true);
    setSelectedMessageIds(new Set([messageId]));
  };

  const toggleForwardSelection = (messageId: string) => {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  if (!post) {
    return (
      <aside className={cn('relative hidden min-h-0 overflow-hidden border-l p-6 xl:flex xl:flex-col', theme === 'dark' ? 'border-white/10 bg-[#241A13]/55' : 'border-[#DFC9A4] bg-[#FFFAF0]/45')}>
        <ThreadResizeHandle theme={theme} width={width} onWidthChange={onWidthChange} />
        {canClose && <button
          type="button"
          aria-label="Toggle side panel"
          title="Toggle side panel"
          onClick={onClose}
          className={cn('absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg border', subtleButton(theme))}
        >
          <PanelRightClose className="h-4 w-4" />
        </button>}
        <EmptyState theme={theme} icon={MessageSquare} title="No thread selected" body="Select or create a post to view its discussion." />
      </aside>
    );
  }

  return (
    <aside className={cn('relative hidden min-h-0 overflow-hidden border-l xl:flex xl:flex-col', theme === 'dark' ? 'border-white/10 bg-[#241A13]/55' : 'border-[#DFC9A4] bg-[#FFFAF0]/45')}>
      <ThreadResizeHandle theme={theme} width={width} onWidthChange={onWidthChange} />
      <div className="shrink-0 border-b border-inherit p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <StatusPill state={post.state} />
            <h2 className="mt-3 text-xl font-bold tracking-tight">{post.title}</h2>
          </div>
          {canClose && <button
            type="button"
            aria-label="Toggle side panel"
            title="Toggle side panel"
            onClick={onClose}
            className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', subtleButton(theme))}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 scroll-area">
        <div className="flex items-start gap-2">
          {forwarding && <MessageSelectionCheckbox checked={selectedMessageIds.has(post.id)} onChange={() => toggleForwardSelection(post.id)} />}
          <div className="min-w-0 flex-1">
            <ThreadCard
              profile={profile}
              body={post.body}
              timestamp={post.created_at}
              theme={theme}
              workspaceId={post.workspace_id}
              reactions={reactions.filter((reaction) => reaction.post_id === post.id && !reaction.comment_id)}
              currentUserId={currentUserId}
              onReply={() => { setReplyingTo(null); textareaRef.current?.focus(); }}
              onReact={(emoji) => onReact(null, emoji)}
              onForward={() => beginForward(post.id)}
            />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-2">
              {forwarding && <MessageSelectionCheckbox checked={selectedMessageIds.has(comment.id)} onChange={() => toggleForwardSelection(comment.id)} />}
              <div className="min-w-0 flex-1">
                <ThreadCard
                  profile={profiles[comment.author_id]}
                  body={comment.body}
                  timestamp={comment.created_at}
                  theme={theme}
                  attachments={attachments.filter((attachment) => attachment.comment_id === comment.id)}
                  workspaceId={comment.workspace_id}
                  reactions={reactions.filter((reaction) => reaction.comment_id === comment.id)}
                  currentUserId={currentUserId}
                  parentComment={comments.find((item) => item.id === comment.parent_comment_id)}
                  onReply={() => { setReplyingTo(comment); textareaRef.current?.focus(); }}
                  onReact={(emoji) => onReact(comment.id, emoji)}
                  onForward={() => beginForward(comment.id)}
                  onDelete={comment.author_id === currentUserId || canManage ? async () => {
                    if (!window.confirm('Delete this message?')) return;
                    await onDeleteComment(comment.id);
                  } : undefined}
                />
              </div>
            </div>
          ))}
          <div ref={latestMessageRef} />
        </div>
      </div>

      {forwarding && (
        <div className={cn('flex shrink-0 items-center gap-3 border-t p-4', theme === 'dark' ? 'border-white/10 bg-[#201815]' : 'border-[#DFC9A4] bg-[#F6EAD4]')}>
          <button type="button" onClick={() => { setForwarding(false); setSelectedMessageIds(new Set()); }} className={cn('h-10 rounded-lg border px-3 text-sm font-semibold', subtleButton(theme))}>Cancel</button>
          <span className={cn('text-sm', muted(theme))}>{selectedMessageIds.size} selected</span>
          <button type="button" disabled={selectedMessageIds.size === 0} onClick={() => setForwardModalOpen(true)} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:opacity-50"><Share2 className="h-4 w-4" />Forward</button>
        </div>
      )}

      <form
        className={cn('shrink-0 border-t p-4', forwarding && 'hidden', dragActive && 'ring-2 ring-inset ring-[#E9B93E]', theme === 'dark' ? 'border-white/10 bg-[#201815]' : 'border-[#DFC9A4] bg-[#F6EAD4]')}
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
            await onReply(reply.trim(), files, replyingTo?.id ?? null);
            setReply('');
            setFiles([]);
            setReplyingTo(null);
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
            setAttachmentMenuOpen(false);
          }}
        />
        {replyingTo && (
          <div className={cn('mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', subtleButton(theme))}>
            <ReplyIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <strong>{getProfileName(profiles[replyingTo.author_id])}</strong>
              <span className={cn('ml-2 line-clamp-1', muted(theme))}>{replyingTo.body || 'Attachment'}</span>
            </span>
            <button type="button" aria-label="Cancel reply" title="Cancel reply" onClick={() => setReplyingTo(null)}><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <textarea
          ref={textareaRef}
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
          <div ref={attachmentMenuRef} className="relative">
            <button
              type="button"
              aria-label="Add attachments"
              title="Add attachment"
              aria-expanded={attachmentMenuOpen}
              onClick={() => setAttachmentMenuOpen((open) => !open)}
              className={cn('inline-flex h-10 w-10 items-center justify-center rounded-lg border', subtleButton(theme))}
            >
              <Plus className="h-4 w-4" />
            </button>
            {attachmentMenuOpen && (
              <AttachmentMenu
                theme={theme}
                onDocument={() => openFilePicker('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip')}
                onMedia={() => openFilePicker('image/*,video/*')}
                onCamera={() => openFilePicker('image/*,video/*', true)}
                onAudio={() => openFilePicker('audio/*')}
                onContact={() => openFilePicker('.vcf,text/vcard')}
                onEvent={() => openFilePicker('.ics,text/calendar')}
                onSticker={() => openFilePicker('image/gif,image/webp,image/png')}
              />
            )}
          </div>
          <button disabled={submitting || (!reply.trim() && files.length === 0)} className="ml-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Reply
          </button>
        </div>
      </form>
      {forwardModalOpen && (
        <ForwardMessagesModal
          theme={theme}
          posts={recentPosts}
          messageCount={selectedMessageIds.size}
          onClose={() => setForwardModalOpen(false)}
          onForward={async (targetPostIds) => {
            await onForward([...selectedMessageIds], targetPostIds);
            setForwardModalOpen(false);
            setForwarding(false);
            setSelectedMessageIds(new Set());
          }}
        />
      )}
    </aside>
  );
}

function ThreadCard({ profile, body, timestamp, theme, workspaceId, attachments = [], reactions, currentUserId, parentComment, onReply, onReact, onForward, onDelete }: { profile?: AppProfile; body: string; timestamp: string; theme: 'light' | 'dark'; workspaceId: string; attachments?: AppAttachment[]; reactions: AppReaction[]; currentUserId: string; parentComment?: AppComment; onReply: () => void; onReact: (emoji: string) => Promise<void>; onForward: () => void; onDelete?: () => Promise<void> }) {
  const urls = extractUrls(body);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reactionGroups = groupReactions(reactions);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setReactionPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [menuOpen]);

  const runAction = async (action: () => Promise<void>) => {
    setActionError('');
    try { await action(); } catch (caughtError) { setActionError(getErrorMessage(caughtError)); }
  };

  return (
    <div className={cn('relative rounded-lg border p-4', surface(theme))}>
      <div className="mb-3 flex items-center gap-3">
        <Avatar profile={profile} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{getProfileName(profile)}</p>
        </div>
      </div>
      {parentComment && (
        <div className={cn('mb-3 border-l-2 border-[#E9B93E] pl-3 text-xs', muted(theme))}>
          <strong>{parentComment.body ? parentComment.body.slice(0, 90) : 'Attachment'}</strong>
        </div>
      )}
      {body && <RichMessageText body={body} theme={theme} />}
      {urls.length > 0 && (
        <div className="mt-3 grid gap-2">
          {urls.map((url) => <div key={url}><LinkPreviewCard url={url} workspaceId={workspaceId} theme={theme} /></div>)}
        </div>
      )}
      {attachments.length > 0 && (
        <div className={cn('grid gap-2', body && 'mt-3')}>
          {attachments.map((attachment) => (
            <div key={attachment.id}>
              <AttachmentPreview attachment={attachment} theme={theme} />
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex min-h-7 flex-wrap items-end gap-2">
        {reactionGroups.map((group) => (
          <button key={group.emoji} type="button" onClick={() => void runAction(() => onReact(group.emoji))} className={cn('inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs', group.userIds.includes(currentUserId) ? 'border-[#E9B93E] bg-[#FFF3C4] text-[#211A16]' : subtleButton(theme))}>
            <span>{group.emoji}</span><span>{group.count}</span>
          </button>
        ))}
        <div ref={menuRef} className="relative ml-auto flex items-center gap-1">
          <span className={cn('text-[11px]', muted(theme))}>{formatMessageTime(timestamp)}</span>
          <button type="button" aria-label="Message actions" title="Message actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className={cn('inline-flex h-7 w-7 items-center justify-center rounded-md', theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-[#FFF3C4]')}>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className={cn('absolute bottom-8 right-0 z-30 w-48 rounded-lg border p-1.5 shadow-2xl', theme === 'dark' ? 'border-white/10 bg-[#211A16]' : 'border-[#DFC9A4] bg-[#FFFAF0]')}>
              <MessageMenuButton icon={ReplyIcon} label="Reply" onClick={() => { onReply(); setMenuOpen(false); }} />
              <MessageMenuButton icon={Copy} label="Copy" onClick={() => { void navigator.clipboard.writeText(body); setMenuOpen(false); }} />
              <MessageMenuButton icon={Smile} label="React" onClick={() => { setReactionPickerOpen(true); setMenuOpen(false); }} />
              <MessageMenuButton icon={Share2} label="Forward" onClick={() => { onForward(); setMenuOpen(false); }} />
              {onDelete && <MessageMenuButton icon={Trash2} label="Delete" danger onClick={() => { void runAction(onDelete); setMenuOpen(false); }} />}
            </div>
          )}
        </div>
      </div>
      {reactionPickerOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4" onClick={() => setReactionPickerOpen(false)}>
          <div className={cn('w-full max-w-sm overflow-hidden rounded-lg border shadow-2xl', theme === 'dark' ? 'border-white/10 bg-[#211A16]' : 'border-[#DFC9A4] bg-[#FFFAF0]')} onClick={(event) => event.stopPropagation()}>
            <div className="flex h-12 items-center justify-between border-b border-inherit px-4">
              <span className="text-sm font-bold">Choose a reaction</span>
              <button type="button" aria-label="Close emoji picker" title="Close" onClick={() => setReactionPickerOpen(false)} className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md', theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-[#FFF3C4]')}><X className="h-4 w-4" /></button>
            </div>
            <Suspense fallback={<div className="flex h-96 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
              <EmojiPicker
                width="100%"
                height={420}
                theme={theme}
                lazyLoadEmojis
                previewConfig={{ showPreview: false }}
                onEmojiClick={(emojiData) => {
                  void runAction(() => onReact(emojiData.emoji));
                  setReactionPickerOpen(false);
                }}
              />
            </Suspense>
          </div>
        </div>
      )}
      {actionError && <p className="mt-2 text-xs font-semibold text-[#B91C1C]">{actionError}</p>}
    </div>
  );
}

function ThreadResizeHandle({ theme, width, onWidthChange }: { theme: 'light' | 'dark'; width: number; onWidthChange: (width: number) => void }) {
  const dragStartRef = useRef<{ x: number; width: number; containerWidth: number } | null>(null);
  return (
    <div
      role="separator"
      aria-label="Resize discussion pane"
      aria-orientation="vertical"
      aria-valuemin={20}
      aria-valuemax={50}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      title="Drag to resize discussion pane"
      onPointerDown={(event) => {
        dragStartRef.current = { x: event.clientX, width, containerWidth: event.currentTarget.parentElement?.parentElement?.clientWidth ?? window.innerWidth };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragStartRef.current) return;
        const deltaPercent = ((dragStartRef.current.x - event.clientX) / dragStartRef.current.containerWidth) * 100;
        onWidthChange(dragStartRef.current.width + deltaPercent);
      }}
      onPointerUp={() => { dragStartRef.current = null; }}
      onLostPointerCapture={() => { dragStartRef.current = null; }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); onWidthChange(width + 2); }
        if (event.key === 'ArrowRight') { event.preventDefault(); onWidthChange(width - 2); }
      }}
      className={cn('absolute inset-y-0 left-0 z-40 w-2 -translate-x-1 cursor-col-resize touch-none outline-none transition after:absolute after:inset-y-0 after:left-1/2 after:w-px after:transition hover:after:w-0.5 focus:after:w-0.5', theme === 'dark' ? 'after:bg-white/20 hover:after:bg-[#E9B93E]' : 'after:bg-[#DFC9A4] hover:after:bg-[#8F4F2E]')}
    />
  );
}

function MessageSelectionCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <label className="mt-4 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label="Select message to forward" className="h-4 w-4 accent-[#8F4F2E]" />
    </label>
  );
}

function ForwardMessagesModal({ theme, posts, messageCount, onClose, onForward }: { theme: 'light' | 'dark'; posts: AppPost[]; messageCount: number; onClose: () => void; onForward: (targetPostIds: string[]) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const visiblePosts = posts.filter((post) => post.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={cn('flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border shadow-2xl', theme === 'dark' ? 'border-white/10 bg-[#211A16]' : 'border-[#DFC9A4] bg-[#FFFAF0]')} onClick={(event) => event.stopPropagation()}>
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-inherit px-4">
          <button type="button" aria-label="Close forward dialog" title="Close" onClick={onClose}><X className="h-5 w-5" /></button>
          <div><p className="font-bold">Forward messages</p><p className={cn('text-xs', muted(theme))}>{messageCount} selected</p></div>
        </div>
        <div className="shrink-0 p-4">
          <label className={cn('flex h-11 items-center gap-2 rounded-lg border px-3', subtleButton(theme))}>
            <Search className="h-4 w-4" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recent discussions" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 scroll-area">
          <p className={cn('px-2 pb-2 text-xs font-semibold uppercase tracking-[0.16em]', muted(theme))}>Recent discussions</p>
          {visiblePosts.length === 0 ? (
            <p className={cn('p-6 text-center text-sm', muted(theme))}>No available discussions.</p>
          ) : visiblePosts.map((post) => (
            <label key={post.id} className={cn('flex cursor-pointer items-center gap-3 rounded-lg p-3', theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-[#FFF3C4]')}>
              <input
                type="checkbox"
                checked={selectedPostIds.has(post.id)}
                onChange={() => setSelectedPostIds((current) => {
                  const next = new Set(current);
                  if (next.has(post.id)) next.delete(post.id); else next.add(post.id);
                  return next;
                })}
                className="h-4 w-4 accent-[#8F4F2E]"
              />
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFF3C4] text-[#8F4F2E]"><MessageSquare className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{post.title}</span><span className={cn('block text-xs', muted(theme))}>Active {formatTimeAgo(post.last_activity_at)}</span></span>
            </label>
          ))}
        </div>
        <div className="shrink-0 border-t border-inherit p-4">
          <button
            type="button"
            disabled={submitting || selectedPostIds.size === 0}
            onClick={async () => {
              setSubmitting(true);
              setError('');
              try { await onForward([...selectedPostIds]); } catch (caughtError) { setError(getErrorMessage(caughtError)); setSubmitting(false); }
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Forward to {selectedPostIds.size || ''} discussion{selectedPostIds.size === 1 ? '' : 's'}
          </button>
          {error && <p className="mt-2 text-sm font-semibold text-[#B91C1C]">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function AttachmentMenu({ theme, onDocument, onMedia, onCamera, onAudio, onContact, onEvent, onSticker }: { theme: 'light' | 'dark'; onDocument: () => void; onMedia: () => void; onCamera: () => void; onAudio: () => void; onContact: () => void; onEvent: () => void; onSticker: () => void }) {
  const items: { label: string; icon: LucideIcon; action: () => void; color: string }[] = [
    { label: 'Document', icon: FileText, action: onDocument, color: 'text-[#7C3AED]' },
    { label: 'Photos & videos', icon: ImageIcon, action: onMedia, color: 'text-[#2563EB]' },
    { label: 'Camera', icon: Camera, action: onCamera, color: 'text-[#DB2777]' },
    { label: 'Audio', icon: Headphones, action: onAudio, color: 'text-[#EA580C]' },
    { label: 'Contact', icon: User, action: onContact, color: 'text-[#0284C7]' },
    { label: 'Event', icon: CalendarDays, action: onEvent, color: 'text-[#C026D3]' },
    { label: 'Sticker', icon: Sticker, action: onSticker, color: 'text-[#0F766E]' },
  ];
  return (
    <div className={cn('absolute bottom-12 left-0 z-40 w-56 rounded-lg border p-2 shadow-2xl', theme === 'dark' ? 'border-white/10 bg-[#211A16]' : 'border-[#DFC9A4] bg-[#FFFAF0]')}>
      {items.map(({ label, icon: Icon, action, color }) => (
        <button key={label} type="button" onClick={action} className={cn('flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold transition', theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-[#FFF3C4]')}>
          <Icon className={cn('h-4 w-4', color)} />
          {label}
        </button>
      ))}
    </div>
  );
}

function MessageMenuButton({ icon: Icon, label, onClick, danger = false }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold transition hover:bg-black/5', danger && 'text-[#B91C1C]')}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function RichMessageText({ body, theme }: { body: string; theme: 'light' | 'dark' }) {
  const parts = body.split(/(https?:\/\/[^\s<]+)/gi);
  return (
    <p className={cn('whitespace-pre-wrap break-words text-sm leading-6', muted(theme))}>
      {parts.map((part, index) => {
        const url = normalizeSharedUrl(part);
        return url ? <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="font-semibold text-[#0F766E] underline decoration-[#0F766E]/40 underline-offset-2">{part}</a> : part;
      })}
    </p>
  );
}

function LinkPreviewCard({ url, workspaceId, theme }: { url: string; workspaceId: string; theme: 'light' | 'dark' }) {
  const [preview, setPreview] = useState<AppLinkPreview | null>(() => linkPreviewCache.get(url) ?? null);

  useEffect(() => {
    if (!supabase || preview) return;
    let active = true;
    void supabase.functions.invoke<AppLinkPreview>('link-preview', { body: { url, workspaceId } }).then(({ data, error }) => {
      if (!active || error || !data?.title) return;
      linkPreviewCache.set(url, data);
      setPreview(data);
    });
    return () => { active = false; };
  }, [preview, url, workspaceId]);

  if (!preview) return null;
  return (
    <a href={preview.url} target="_blank" rel="noreferrer" className={cn('grid overflow-hidden rounded-lg border transition hover:border-[#E9B93E]', preview.image && 'grid-cols-[96px_minmax(0,1fr)]', subtleButton(theme))}>
      {preview.image && <img src={preview.image} alt="" className="h-full min-h-24 w-24 object-cover" />}
      <span className="min-w-0 p-3">
        <span className={cn('flex items-center gap-1.5 text-xs font-semibold', muted(theme))}><Globe2 className="h-3.5 w-3.5" />{preview.site_name}</span>
        <span className="mt-1 block line-clamp-2 text-sm font-bold">{preview.title}</span>
        {preview.description && <span className={cn('mt-1 block line-clamp-2 text-xs leading-5', muted(theme))}>{preview.description}</span>}
      </span>
    </a>
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
  if (attachment.mime_type.startsWith('audio/')) {
    return <audio src={attachment.signed_url} controls preload="metadata" className="w-full" />;
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
  canManageTaskActions,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  onStatusChange,
  onArchiveTask,
}: {
  tasks: AppTask[];
  profiles: Record<string, AppProfile>;
  theme: 'light' | 'dark';
  canManageTaskActions: boolean;
  onCreateTask: () => void;
  onEditTask: (task: AppTask) => void;
  onDeleteTask: (task: AppTask) => Promise<void>;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void>;
  onArchiveTask: (task: AppTask) => Promise<void>;
}) {
  const [mode, setMode] = useState<'board' | 'list' | 'calendar'>('board');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && (task.priority ?? 'medium') !== priorityFilter) return false;
    const normalizedQuery = query.trim().toLowerCase();
    return !normalizedQuery || `${task.title} ${task.description ?? ''} ${task.project_name ?? ''} ${(task.tags ?? []).join(' ')}`.toLowerCase().includes(normalizedQuery);
  });
  const tabs: { value: typeof mode; label: string; icon: LucideIcon }[] = [
    { value: 'board', label: 'Board', icon: LayoutGrid },
    { value: 'list', label: 'List', icon: List },
    { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  ];
  return (
    <StaticPanel theme={theme} title="Tasks" icon={ClipboardList}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className={cn('inline-flex rounded-lg border p-1', surface(theme))}>
          {tabs.map(({ value, label, icon: Icon }) => <button key={value} onClick={() => setMode(value)} className={cn('inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition', mode === value ? 'bg-[#E9B93E] text-[#211A16] shadow-sm' : muted(theme))}><Icon className="h-4 w-4" />{label}</button>)}
        </div>
        <button onClick={onCreateTask} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />New task</button>
      </div>
      {tasks.length === 0 ? <EmptyState theme={theme} icon={ClipboardList} title="No tasks yet" body="Create the first task to start planning camp projects." actionLabel="Create task" onAction={onCreateTask} /> : mode === 'board' ? (
        <TaskBoard tasks={filteredTasks} profiles={profiles} theme={theme} onCreateTask={onCreateTask} onStatusChange={onStatusChange} />
      ) : mode === 'list' ? (
        <TaskList tasks={filteredTasks} profiles={profiles} theme={theme} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} canManageTaskActions={canManageTaskActions} onStatusChange={onStatusChange} onEditTask={onEditTask} onDeleteTask={onDeleteTask} onArchiveTask={onArchiveTask} />
      ) : (
        <TaskCalendar tasks={filteredTasks} profiles={profiles} theme={theme} />
      )}
    </StaticPanel>
  );
}

const taskColumns: { status: TaskStatus; label: string; dot: string }[] = [
  { status: 'todo', label: 'To do', dot: 'bg-[#94A3B8]' },
  { status: 'in_progress', label: 'In progress', dot: 'bg-[#3B82F6]' },
  { status: 'blocked', label: 'Blocked', dot: 'bg-[#F59E0B]' },
  { status: 'done', label: 'Done', dot: 'bg-[#10B981]' },
  { status: 'canceled', label: 'Canceled', dot: 'bg-[#EF4444]' },
];

function TaskBoard({ tasks, profiles, theme, onCreateTask, onStatusChange }: { tasks: AppTask[]; profiles: Record<string, AppProfile>; theme: 'light' | 'dark'; onCreateTask: () => void; onStatusChange: (taskId: string, status: TaskStatus) => Promise<void> }) {
  return (
    <div className="min-h-0 overflow-x-auto pb-3 scroll-area">
      <div className="grid min-w-max grid-flow-col auto-cols-[280px] gap-4">
        {taskColumns.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.status);
          return <section key={column.status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const taskId = event.dataTransfer.getData('text/tribu-task'); if (taskId) void onStatusChange(taskId, column.status); }}>
            <div className="mb-3 flex items-center gap-2 px-1"><span className={cn('h-2.5 w-2.5 rounded-full', column.dot)} /><h3 className="text-sm font-bold">{column.label}</h3><span className={cn('ml-auto rounded-full px-2 py-0.5 text-xs', theme === 'dark' ? 'bg-white/10' : 'bg-[#EDF2F7]', muted(theme))}>{columnTasks.length}</span></div>
            <div className="space-y-3">
              {columnTasks.map((task) => <div key={task.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/tribu-task', task.id); }} className={cn('cursor-grab rounded-lg border p-4 shadow-sm active:cursor-grabbing', surface(theme))}>
                <p className="font-semibold">{task.title}</p>{task.description && <p className={cn('mt-1 line-clamp-2 text-xs leading-5', muted(theme))}>{task.description}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5"><PriorityPill priority={task.priority ?? 'medium'} />{(task.tags ?? []).slice(0, 2).map((tag) => <span key={tag} className={cn('rounded-full px-2 py-1 text-[11px]', theme === 'dark' ? 'bg-white/10' : 'bg-[#EDF2F7]')}>{tag}</span>)}</div>
                <div className="mt-4 flex items-center gap-2"><Avatar profile={task.assignee_id ? profiles[task.assignee_id] : undefined} /><span className={cn('min-w-0 flex-1 truncate text-xs', muted(theme))}>{task.project_name || 'General project'}</span>{task.due_at && <span className={cn('text-[11px]', muted(theme))}>{formatTaskDate(task.due_at)}</span>}</div>
              </div>)}
              <button onClick={onCreateTask} className={cn('inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed text-sm', muted(theme))}><Plus className="h-4 w-4" />Add task</button>
            </div>
          </section>;
        })}
      </div>
    </div>
  );
}

function TaskList({ tasks, profiles, theme, query, setQuery, statusFilter, setStatusFilter, priorityFilter, setPriorityFilter, canManageTaskActions, onStatusChange, onEditTask, onDeleteTask, onArchiveTask }: { tasks: AppTask[]; profiles: Record<string, AppProfile>; theme: 'light' | 'dark'; query: string; setQuery: (value: string) => void; statusFilter: TaskStatus | 'all'; setStatusFilter: (value: TaskStatus | 'all') => void; priorityFilter: TaskPriority | 'all'; setPriorityFilter: (value: TaskPriority | 'all') => void; canManageTaskActions: boolean; onStatusChange: (taskId: string, status: TaskStatus) => Promise<void>; onEditTask: (task: AppTask) => void; onDeleteTask: (task: AppTask) => Promise<void>; onArchiveTask: (task: AppTask) => Promise<void> }) {
  return <div><div className="mb-4 flex flex-wrap items-center gap-2"><Filter className={cn('h-4 w-4', muted(theme))} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TaskStatus | 'all')} className={cn('h-10 rounded-lg border bg-transparent px-3 text-sm outline-none', subtleButton(theme))}><option value="all">All statuses</option>{taskColumns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}</select><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | 'all')} className={cn('h-10 rounded-lg border bg-transparent px-3 text-sm outline-none', subtleButton(theme))}><option value="all">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><label className={cn('ml-auto flex h-10 min-w-56 items-center gap-2 rounded-lg border px-3', surface(theme))}><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label></div>
    <div className={cn('overflow-x-auto rounded-lg border', surface(theme))}><table className="w-full min-w-[900px] border-collapse text-left"><thead><tr className="border-b border-inherit">{['Task', 'Project', 'Assignee', 'Status', 'Priority', 'Due date', 'Actions'].map((heading) => <th key={heading} className={cn('px-4 py-3 text-xs uppercase tracking-[0.12em]', muted(theme))}>{heading}</th>)}</tr></thead><tbody>{tasks.map((task) => <tr key={task.id} className="border-b border-inherit last:border-0"><td className="px-4 py-3"><p className="text-sm font-semibold">{task.title}</p><p className={cn('max-w-64 truncate text-xs', muted(theme))}>{task.description}</p></td><td className={cn('px-4 py-3 text-sm', muted(theme))}>{task.project_name || 'General'}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar profile={task.assignee_id ? profiles[task.assignee_id] : undefined} /><span className="text-sm">{task.assignee_id ? profiles[task.assignee_id]?.display_name ?? 'Assigned' : 'Unassigned'}</span></div></td><td className="px-4 py-3"><select aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => void onStatusChange(task.id, event.target.value as TaskStatus)} className={cn('h-9 rounded-lg border bg-transparent px-2 text-xs font-semibold outline-none', subtleButton(theme))}>{taskColumns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}</select></td><td className="px-4 py-3"><PriorityPill priority={task.priority ?? 'medium'} /></td><td className={cn('px-4 py-3 text-sm', muted(theme))}>{task.due_at ? formatTaskDate(task.due_at) : 'No date'}</td><td className="px-4 py-3"><div className="flex gap-2">{canManageTaskActions && <button aria-label="Edit task" title="Edit task" onClick={() => onEditTask(task)} className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md border', subtleButton(theme))}><Pencil className="h-3.5 w-3.5" /></button>}{canManageTaskActions && <button aria-label="Delete task" title="Delete task" onClick={() => void onDeleteTask(task)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#FCA5A5] text-[#B91C1C]"><Trash2 className="h-3.5 w-3.5" /></button>}{(task.status === 'done' || task.status === 'canceled') && <button aria-label="Archive task" title="Archive task" onClick={() => void onArchiveTask(task)} className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md border', subtleButton(theme))}><Archive className="h-3.5 w-3.5" /></button>}</div></td></tr>)}</tbody></table>{tasks.length === 0 && <p className={cn('p-8 text-center text-sm', muted(theme))}>No tasks match these filters.</p>}</div>
  </div>;
}

function TaskCalendar({ tasks, profiles, theme }: { tasks: AppTask[]; profiles: Record<string, AppProfile>; theme: 'light' | 'dark' }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const days = buildCalendarDays(month);
  const selectedTasks = tasks.filter((task) => task.due_at && toTaskDateKey(task.due_at) === selectedDate);
  return <div><div className="mb-4 flex items-center justify-between"><button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg border', subtleButton(theme))}><ChevronLeft className="h-4 w-4" /></button><h3 className="font-bold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3><button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg border', subtleButton(theme))}><ChevronRight className="h-4 w-4" /></button></div><div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.7fr)]"><div className={cn('overflow-hidden rounded-lg border', surface(theme))}><div className="grid grid-cols-7 border-b border-inherit">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div key={day} className={cn('p-2 text-center text-xs font-semibold', muted(theme))}>{day}</div>)}</div><div className="grid grid-cols-7">{days.map((day) => { const key = toDateKey(day); const dayTasks = tasks.filter((task) => task.due_at && toTaskDateKey(task.due_at) === key); const inMonth = day.getMonth() === month.getMonth(); return <button key={key} onClick={() => setSelectedDate(key)} className={cn('relative min-h-24 border-b border-r border-inherit p-2 text-left align-top transition', !inMonth && 'opacity-40', selectedDate === key && 'ring-2 ring-inset ring-[#E9B93E]')}><span className="text-xs font-semibold">{day.getDate()}</span><div className="mt-2 space-y-1">{dayTasks.slice(0, 2).map((task) => <span key={task.id} className="block truncate rounded bg-[#FFF3C4] px-1.5 py-1 text-[10px] text-[#8F4F2E]">{task.title}</span>)}{dayTasks.length > 2 && <span className={cn('text-[10px]', muted(theme))}>+{dayTasks.length - 2} more</span>}</div></button>; })}</div></div><aside className={cn('rounded-lg border p-4', surface(theme))}><h3 className="font-bold">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3><p className={cn('mt-1 text-xs', muted(theme))}>{selectedTasks.length} task{selectedTasks.length === 1 ? '' : 's'}</p><div className="mt-4 space-y-3">{selectedTasks.map((task) => <div key={task.id} className="border-l-2 border-[#E9B93E] pl-3"><p className="text-sm font-semibold">{task.title}</p><p className={cn('text-xs', muted(theme))}>{task.project_name || 'General'} · {task.assignee_id ? profiles[task.assignee_id]?.display_name ?? 'Assigned' : 'Unassigned'}</p></div>)}{selectedTasks.length === 0 && <p className={cn('py-10 text-center text-sm', muted(theme))}>No tasks for this date.</p>}</div></aside></div></div>;
}

function PriorityPill({ priority }: { priority: TaskPriority }) {
  const styles: Record<TaskPriority, string> = { low: 'bg-[#EDF2F7] text-[#475569]', medium: 'bg-[#DBEAFE] text-[#1D4ED8]', high: 'bg-[#FEF3C7] text-[#B45309]', urgent: 'bg-[#FEE2E2] text-[#B91C1C]' };
  return <span className={cn('rounded-full px-2 py-1 text-[11px] font-semibold capitalize', styles[priority])}>{priority}</span>;
}

function KnowledgeView({
  articles,
  profiles,
  theme,
  canManage,
  onCreate,
  onEdit,
  onDelete,
}: {
  articles: KnowledgeArticle[];
  profiles: Record<string, AppProfile>;
  theme: 'light' | 'dark';
  canManage: boolean;
  onCreate: () => void;
  onEdit: (article: KnowledgeArticle) => void;
  onDelete: (article: KnowledgeArticle) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory | 'all'>('all');
  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id ?? '');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleArticles = articles.filter((article) => {
    if (category !== 'all' && article.category !== category) return false;
    if (!normalizedQuery) return true;
    return `${article.title} ${article.summary ?? ''} ${article.content}`.toLowerCase().includes(normalizedQuery);
  });
  const selectedArticle = visibleArticles.find((article) => article.id === selectedArticleId) ?? visibleArticles[0];

  return (
    <StaticPanel theme={theme} title="Knowledge base" icon={FileText}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className={cn('flex h-11 min-w-60 flex-1 items-center gap-2 rounded-lg border px-3', surface(theme))}>
          <Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guides, FAQs, and procedures" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <select value={category} onChange={(event) => setCategory(event.target.value as KnowledgeCategory | 'all')} className={cn('h-11 rounded-lg border bg-transparent px-3 text-sm font-semibold outline-none', subtleButton(theme))}>
          <option value="all">All categories</option>
          {knowledgeCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button onClick={onCreate} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />New article</button>
      </div>
      {visibleArticles.length === 0 ? (
        <EmptyState theme={theme} icon={FileText} title="No knowledge articles found" body="Create documentation, how-to guides, FAQs, best practices, troubleshooting steps, or standard operating procedures." actionLabel="Create article" onAction={onCreate} />
      ) : (
        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)]">
          <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1 scroll-area">
            {visibleArticles.map((article) => (
              <button key={article.id} onClick={() => setSelectedArticleId(article.id)} className={cn('w-full rounded-lg border p-4 text-left transition', selectedArticle?.id === article.id ? 'border-[#E9B93E] bg-[#FFF3C4]/60' : surface(theme))}>
                <span className={cn('text-xs font-semibold uppercase tracking-[0.12em]', muted(theme))}>{getKnowledgeCategoryLabel(article.category)}</span>
                <span className="mt-2 block font-bold">{article.title}</span>
                {article.summary && <span className={cn('mt-1 block line-clamp-2 text-sm', muted(theme))}>{article.summary}</span>}
              </button>
            ))}
          </div>
          {selectedArticle && (
            <article className={cn('max-h-[62vh] overflow-y-auto rounded-lg border p-6 scroll-area', surface(theme))}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1"><p className={cn('text-xs font-semibold uppercase tracking-[0.14em]', muted(theme))}>{getKnowledgeCategoryLabel(selectedArticle.category)}</p><h2 className="mt-2 text-2xl font-bold">{selectedArticle.title}</h2></div>
                {canManage && <div className="flex gap-2"><button aria-label="Edit article" title="Edit article" onClick={() => onEdit(selectedArticle)} className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg border', subtleButton(theme))}><Pencil className="h-4 w-4" /></button><button aria-label="Delete article" title="Delete article" onClick={() => void onDelete(selectedArticle)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"><Trash2 className="h-4 w-4" /></button></div>}
              </div>
              {selectedArticle.summary && <p className={cn('mt-4 border-l-2 border-[#E9B93E] pl-4 text-sm leading-6', muted(theme))}>{selectedArticle.summary}</p>}
              <div className={cn('mt-6 whitespace-pre-wrap text-sm leading-7', muted(theme))}>{selectedArticle.content}</div>
              <div className="mt-8 flex items-center gap-3 border-t border-inherit pt-4"><Avatar profile={profiles[selectedArticle.created_by]} /><div><p className="text-sm font-semibold">{profiles[selectedArticle.created_by]?.display_name ?? 'Camp member'}</p><p className={cn('text-xs', muted(theme))}>Updated {formatTimeAgo(selectedArticle.updated_at)}</p></div></div>
            </article>
          )}
        </div>
      )}
    </StaticPanel>
  );
}

function AdminView({
  workspace,
  theme,
  memberships,
  profiles,
  onInvite,
  onRoleChange,
}: {
  workspace?: AppWorkspace;
  theme: 'light' | 'dark';
  memberships: AppMembership[];
  profiles: Record<string, AppProfile>;
  onInvite: (email: string, role: WorkspaceRole) => Promise<string>;
  onRoleChange: (membershipId: string, role: WorkspaceRole) => Promise<void>;
}) {
  const [permissionsHelpOpen, setPermissionsHelpOpen] = useState(false);
  const [roleError, setRoleError] = useState('');
  const groups: { title: string; roles: WorkspaceRole[] }[] = [
    { title: 'Admins', roles: ['owner', 'admin'] },
    { title: 'Members', roles: ['member'] },
    { title: 'Guests', roles: ['guest'] },
  ];

  return (
    <StaticPanel theme={theme} title="Admin" icon={ShieldCheck}>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={cn('rounded-lg border p-4', surface(theme))}>
          <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', muted(theme))}>Camp</p>
          <h2 className="mt-2 text-xl font-bold">{workspace?.name}</h2>
          <p className={cn('mt-1 text-sm capitalize', muted(theme))}>{workspace?.plan ?? 'free'} plan</p>
        </div>
        <div className={cn('relative rounded-lg border p-4', surface(theme))}>
          <div className="flex items-center justify-between gap-3">
            <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', muted(theme))}>Permissions</p>
            <button type="button" aria-label="How permissions work" title="How permissions work" onClick={() => setPermissionsHelpOpen((open) => !open)} className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg border', subtleButton(theme))}>
              <CircleHelp className="h-4 w-4" />
            </button>
          </div>
          {permissionsHelpOpen && (
            <div className={cn('absolute right-4 top-14 z-30 w-[min(340px,calc(100%_-_32px))] rounded-lg border p-4 shadow-2xl', theme === 'dark' ? 'border-white/10 bg-[#211A16]' : 'border-[#DFC9A4] bg-[#FFFAF0]')}>
              <div className="space-y-3">
                {workspaceRoles.map(({ role, detail }) => <div key={role}><p className="text-sm font-semibold">{getRoleLabel(role)}</p><p className={cn('text-xs leading-5', muted(theme))}>{detail}</p></div>)}
              </div>
            </div>
          )}
          <InvitePanel theme={theme} onInvite={onInvite} />
        </div>

        <section className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div><h3 className="font-bold">People and roles</h3><p className={cn('text-sm', muted(theme))}>Manage camp access without opening individual profiles.</p></div>
          </div>
          <div className="grid gap-5">
            {groups.map((group) => {
              const groupMemberships = memberships.filter((membership) => group.roles.includes(membership.role));
              return (
                <div key={group.title}>
                  <p className={cn('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', muted(theme))}>{group.title} · {groupMemberships.length}</p>
                  <div className="grid gap-2">
                    {groupMemberships.map((membership) => {
                      const member = profiles[membership.user_id];
                      return (
                        <div key={membership.id} className={cn('grid items-center gap-3 rounded-lg border p-3 md:grid-cols-[auto_minmax(120px,1fr)_minmax(180px,1.4fr)_minmax(130px,1fr)_150px]', surface(theme))}>
                          <Avatar profile={member} />
                          <span className="min-w-0 truncate text-sm font-semibold">{getProfileFullName(member)}</span>
                          <span className={cn('min-w-0 truncate text-sm', muted(theme))}>{member?.email ?? 'No email'}</span>
                          <span className={cn('min-w-0 truncate text-sm', muted(theme))}>{member?.phone || 'No contact number'}</span>
                          <select
                            value={membership.role}
                            disabled={membership.role === 'owner'}
                            aria-label={`Role for ${getProfileFullName(member, 'member')}`}
                            onChange={async (event) => {
                              setRoleError('');
                              try { await onRoleChange(membership.id, event.target.value as WorkspaceRole); }
                              catch (caughtError) { setRoleError(getErrorMessage(caughtError)); }
                            }}
                            className={cn('h-10 rounded-lg border bg-transparent px-3 text-sm font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-70', subtleButton(theme))}
                          >
                            {membership.role === 'owner' && <option value="owner">Chief</option>}
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="guest">Guest</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {roleError && <p className="mt-3 text-sm font-semibold text-[#B91C1C]">{roleError}</p>}
        </section>
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
    <div className="mt-5 border-t border-inherit pt-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF3C4] text-[#8F4F2E]">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold">Invite by role</h3>
          <p className={cn('text-sm', muted(theme))}>Invite an Admin, Member, or Guest using their camp email.</p>
        </div>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]"
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
        <button disabled={submitting || !email.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">
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

function KnowledgeArticleModal({ theme, article, onClose, onSave }: { theme: 'light' | 'dark'; article?: KnowledgeArticle; onClose: () => void; onSave: (input: { category: KnowledgeCategory; title: string; summary: string; content: string }) => Promise<void> }) {
  const [category, setCategory] = useState<KnowledgeCategory>(article?.category ?? 'documentation');
  const [title, setTitle] = useState(article?.title ?? '');
  const [summary, setSummary] = useState(article?.summary ?? '');
  const [content, setContent] = useState(article?.content ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  return (
    <ModalShell theme={theme} title={article ? 'Edit knowledge article' : 'New knowledge article'} onClose={onClose}>
      <form className="grid gap-4" onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || !content.trim()) return;
        setSubmitting(true); setError('');
        try { await onSave({ category, title: title.trim(), summary: summary.trim(), content: content.trim() }); }
        catch (caughtError) { setError(getErrorMessage(caughtError)); setSubmitting(false); }
      }}>
        <label className="grid gap-2 text-sm font-semibold">Category<select value={category} onChange={(event) => setCategory(event.target.value as KnowledgeCategory)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))}>{knowledgeCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-semibold">Title<input value={title} onChange={(event) => setTitle(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} /></label>
        <label className="grid gap-2 text-sm font-semibold">Summary<input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="A short description for search results" className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} /></label>
        <label className="grid gap-2 text-sm font-semibold">Article content<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write clear steps, answers, or procedures..." className={cn('h-64 resize-y rounded-lg border bg-transparent p-3 leading-6 outline-none', subtleButton(theme))} /></label>
        <button disabled={submitting || !title.trim() || !content.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:opacity-50">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}{article ? 'Save article' : 'Publish article'}</button>
        {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}
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
  onCreate: (input: { title: string; description: string; projectName: string; priority: TaskPriority; tags: string[]; assigneeId: string; dueAt: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [projectName, setProjectName] = useState(task?.project_name ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [tags, setTags] = useState((task?.tags ?? []).join(', '));
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
            await onCreate({ title: title.trim(), description: description.trim(), projectName: projectName.trim(), priority, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8), assigneeId, dueAt });
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
          <label className="grid gap-2 text-sm font-semibold">Project<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Website redesign" className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} /></label>
          <label className="grid gap-2 text-sm font-semibold">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        </div>
        <label className="grid gap-2 text-sm font-semibold">Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="design, onboarding, client" className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} /><span className={cn('text-xs font-normal', muted(theme))}>Separate tags with commas.</span></label>
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
  section,
  theme,
  setTheme,
  chatOpen,
  setChatOpen,
  profile,
  email,
  workspace,
  role,
  onClose,
  onSaveProfile,
  onUploadAvatar,
}: {
  section: AccountModalView;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  profile?: AppProfile;
  email: string;
  workspace?: AppWorkspace;
  role?: WorkspaceRole;
  onClose: () => void;
  onSaveProfile: (input: { fullName: string; nickname: string; avatarUrl: string; phone: string; address: string; timezone: string; bio: string }) => Promise<void>;
  onUploadAvatar: (file: File) => Promise<string>;
}) {
  const [fullName, setFullName] = useState(profile?.full_name ?? profile?.display_name ?? '');
  const [nickname, setNickname] = useState(profile?.nickname ?? profile?.display_name ?? email.split('@')[0] ?? '');
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
  const modalTitles: Record<AccountModalView, string> = {
    personalization: 'Personalization',
    profile: 'Profile',
    settings: 'Settings',
    help: 'Help center',
    about: 'About Tribu',
  };

  return (
    <ModalShell theme={theme} title={modalTitles[section]} onClose={onClose} wide={section === 'profile'}>
      <div className="grid gap-5">
        {section === 'profile' && <section className={cn('rounded-lg border p-4', surface(theme))}>
          <div className="mb-4 flex items-center gap-3">
            <Avatar profile={{ id: profile?.id ?? '', email, display_name: nickname || 'Member', full_name: fullName, nickname, avatar_url: avatarUrl || null, timezone }} />
            <div className="min-w-0">
              <p className="truncate font-bold">{nickname || 'Camp member'}</p>
              <p className={cn('truncate text-sm', muted(theme))}>{workspace?.name ?? 'Camp'} · {role ? getRoleLabel(role) : 'Member'}</p>
            </div>
          </div>
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!fullName.trim() || !nickname.trim()) return;
              setSubmitting(true);
              setSaved(false);
              setError('');
              try {
                await onSaveProfile({
                  fullName: fullName.trim(),
                  nickname: nickname.trim(),
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
              <span className="inline-flex items-center gap-2"><User className="h-4 w-4" /> Full name</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Nickname
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
              <span className={cn('text-xs font-normal', muted(theme))}>Shown in chat, posts, and your profile.</span>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4" /> Tribu email</span>
              <input readOnly value={email} className={cn('h-11 cursor-not-allowed rounded-lg border bg-transparent px-3 opacity-75 outline-none', subtleButton(theme))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" /> Contact number</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold md:col-span-2">
              Address
              <input value={address} onChange={(event) => setAddress(event.target.value)} className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
            </label>
            <label className="grid gap-2 text-sm font-semibold md:col-span-2">
              <span className="inline-flex items-center gap-2"><Camera className="h-4 w-4" /> Photo URL</span>
              <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." className={cn('h-11 rounded-lg border bg-transparent px-3 outline-none', subtleButton(theme))} />
            </label>
            <div className="grid gap-2 text-sm font-semibold md:col-span-2">
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
            <label className="grid gap-2 text-sm font-semibold md:col-span-2">
              About
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} className={cn('h-24 resize-none rounded-lg border bg-transparent p-3 outline-none', subtleButton(theme))} />
            </label>
            <button disabled={submitting || !fullName.trim() || !nickname.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save profile
            </button>
            {saved && <p className="text-sm font-semibold text-[#0F766E] md:col-span-2">Profile saved.</p>}
            {error && <p className="text-sm font-semibold text-[#B91C1C] md:col-span-2">{error}</p>}
          </form>
        </section>}

        {section === 'personalization' && <section className={cn('rounded-lg border p-4', surface(theme))}>
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
          <div className="mt-5 border-t border-inherit pt-4">
            <p className="font-bold">Workspace layout</p>
            <label className="mt-3 flex items-center justify-between gap-4 text-sm">
              <span><span className="block font-semibold">Discussion side panel</span><span className={cn('mt-1 block text-xs', muted(theme))}>Show chat on Tasks, Knowledge, and Admin. Active Feed always includes it.</span></span>
              <input type="checkbox" checked={chatOpen} onChange={(event) => setChatOpen(event.target.checked)} className="h-4 w-4 accent-[#8F4F2E]" />
            </label>
          </div>
        </section>}

        {section === 'settings' && (
          <div className="grid gap-3">
            <section className={cn('rounded-lg border p-4', surface(theme))}>
              <p className={cn('text-xs font-semibold uppercase tracking-[0.16em]', muted(theme))}>Account</p>
              <div className="mt-3 flex items-center gap-3"><Avatar profile={profile} /><div className="min-w-0"><p className="truncate font-bold">{getProfileName(profile, email.split('@')[0] || 'Camp member')}</p><p className={cn('truncate text-sm', muted(theme))}>{email}</p></div></div>
            </section>
            <section className={cn('rounded-lg border p-4', surface(theme))}>
              <p className={cn('text-xs font-semibold uppercase tracking-[0.16em]', muted(theme))}>Plan</p>
              <p className="mt-2 text-lg font-bold capitalize">{workspace?.plan ?? 'Free'}</p>
              <p className={cn('mt-1 text-sm leading-6', muted(theme))}>Your current Tribu account includes the core Camp, Trail, feed, task, and knowledge features.</p>
            </section>
            <section className={cn('rounded-lg border p-4', surface(theme))}>
              <p className={cn('text-xs font-semibold uppercase tracking-[0.16em]', muted(theme))}>Camp access</p>
              <p className="mt-2 font-bold">{workspace?.name ?? 'Camp'}</p>
              <p className={cn('mt-1 text-sm', muted(theme))}>{role ? getRoleLabel(role) : 'Member'} role</p>
            </section>
          </div>
        )}

        {section === 'help' && (
          <div className="grid gap-3">
            <HelpTopic title="Start with the Active Feed" body="Create a post in a Trail, assign it to a camp member, attach files, and continue the conversation in the discussion panel." theme={theme} />
            <HelpTopic title="Plan work in Tasks" body="Use Board, List, or Calendar. Drag cards between stages, set priorities and due dates, and archive completed work." theme={theme} />
            <HelpTopic title="Build shared knowledge" body="Publish how-to guides, FAQs, troubleshooting notes, and standard procedures so your camp can find answers quickly." theme={theme} />
            <HelpTopic title="Manage access" body="Chiefs and Admins can invite people and manage roles from Admin. Members and Guests only see the areas permitted for their role." theme={theme} />
            <a href="https://github.com/jbo11/Tribu/issues/new" target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#8F4F2E] px-4 text-sm font-semibold text-white"><Bug className="h-4 w-4" />Report a problem</a>
          </div>
        )}

        {section === 'about' && (
          <section className={cn('rounded-lg border p-5', surface(theme))}>
            <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E9B93E]"><TribuLogo className="h-10 w-10" /></div><div><p className="text-lg font-bold">Tribu</p><p className={cn('text-sm', muted(theme))}>Collaborative camps for teams</p></div></div>
            <p className={cn('mt-5 text-sm leading-7', muted(theme))}>Tribu brings conversations, project work, shared knowledge, and camp administration into one focused workspace.</p>
            <div className="mt-5 border-t border-inherit pt-4"><p className="text-sm font-semibold">Account plan</p><p className={cn('mt-1 text-sm capitalize', muted(theme))}>{workspace?.plan ?? 'Free'}</p></div>
          </section>
        )}
      </div>
    </ModalShell>
  );
}

function ModalShell({ theme, title, children, onClose, wide = false }: { theme: 'light' | 'dark'; title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4">
      <div className={cn('max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-xl border p-5 shadow-2xl scroll-area', wide ? 'max-w-4xl' : 'max-w-lg', theme === 'dark' ? 'border-white/10 bg-[#201815]' : 'border-[#DFC9A4] bg-[#FFFAF0]')}>
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

function AccountMenuButton({ icon: Icon, label, trailing: TrailingIcon, active = false, onClick }: { icon: LucideIcon; label: string; trailing?: LucideIcon; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition hover:bg-white/10', active && 'bg-white/10')}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {TrailingIcon && <TrailingIcon className={cn('h-4 w-4 shrink-0 transition-transform', active && 'rotate-90')} />}
    </button>
  );
}

function HelpTopic({ title, body, theme }: { title: string; body: string; theme: 'light' | 'dark' }) {
  return (
    <section className={cn('rounded-lg border p-4', surface(theme))}>
      <p className="font-bold">{title}</p>
      <p className={cn('mt-2 text-sm leading-6', muted(theme))}>{body}</p>
    </section>
  );
}

function StatusPill({ state }: { state: AppPost['state'] }) {
  const styles = {
    open: 'bg-[#DBEAFE] text-[#1D4ED8]',
    read_only: 'bg-[#F1F5F9] text-[#475569]',
    locked: 'bg-[#FEE2E2] text-[#B91C1C]',
    archived: 'bg-[#E5E7EB] text-[#374151]',
  };
  const labels: Record<AppPost['state'], string> = {
    open: 'Active',
    read_only: 'Read only',
    locked: 'Locked',
    archived: 'Archived',
  };
  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', styles[state])}>{labels[state]}</span>;
}

function getProfileName(profile?: AppProfile, fallback = 'Camp member') {
  return profile?.nickname?.trim() || profile?.display_name?.trim() || fallback;
}

function getProfileFullName(profile?: AppProfile, fallback = 'Camp member') {
  return profile?.full_name?.trim() || profile?.display_name?.trim() || fallback;
}

function Avatar({ profile }: { profile?: AppProfile }) {
  const profileName = getProfileName(profile);
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={profileName} className="h-9 w-9 rounded-lg object-cover" />;
  }
  return <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF3C4] text-sm font-bold text-[#8F4F2E]">{profileName.slice(0, 1).toUpperCase()}</div>;
}

async function fetchProfiles(userIds: string[]) {
  if (!supabase || userIds.length === 0) return [];

  const profileResult = await supabase
    .from('users')
    .select(PROFILE_SELECT)
    .in('id', userIds);

  if (!profileResult.error) return (profileResult.data ?? []) as AppProfile[];

  const missingProfileColumn = ['full_name', 'nickname', 'phone', 'address', 'bio'].some((column) => profileResult.error.message.includes(column));
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
    full_name: displayName,
    nickname: displayName,
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

async function assignPost(postId: string, assigneeId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('assign_post', {
    target_post_id: postId,
    target_user_id: assigneeId || null,
  });
  if (error) throw error;
}

async function setPostArchived(postId: string, archived: boolean) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('set_post_archived', {
    target_post_id: postId,
    should_archive: archived,
  });
  if (error) throw error;
}

async function createComment(post: AppPost, userId: string, body: string, isDecision: boolean, files: File[], parentCommentId: string | null) {
  if (!supabase) return;
  const { data: comment, error } = await supabase
    .from('comments')
    .insert({
      workspace_id: post.workspace_id,
      post_id: post.id,
      author_id: userId,
      body,
      is_decision: isDecision,
      parent_comment_id: parentCommentId,
    })
    .select('id')
    .single();
  if (error) throw error;
  for (const file of files) {
    await uploadCommentAttachment(post, comment.id, userId, file);
  }
}

async function forwardMessages(targetPosts: AppPost[], messages: ForwardableMessage[], userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  for (const targetPost of targetPosts) {
    for (const message of messages) {
      const { data: forwardedComment, error: commentError } = await supabase
        .from('comments')
        .insert({
          workspace_id: targetPost.workspace_id,
          post_id: targetPost.id,
          author_id: userId,
          body: message.body,
          is_decision: false,
        })
        .select('id')
        .single();
      if (commentError) throw commentError;

      for (const attachment of message.attachments) {
        const destinationPath = `${targetPost.workspace_id}/${userId}/${forwardedComment.id}/${crypto.randomUUID()}-${sanitizeFilename(attachment.filename)}`;
        const { error: copyError } = await supabase.storage.from(attachment.bucket).copy(attachment.object_path, destinationPath);
        if (copyError) throw copyError;
        const { error: attachmentError } = await supabase.from('attachments').insert({
          workspace_id: targetPost.workspace_id,
          post_id: targetPost.id,
          comment_id: forwardedComment.id,
          uploaded_by: userId,
          bucket: attachment.bucket,
          object_path: destinationPath,
          filename: attachment.filename,
          mime_type: attachment.mime_type,
          byte_size: attachment.byte_size,
        });
        if (attachmentError) {
          await supabase.storage.from(attachment.bucket).remove([destinationPath]);
          throw attachmentError;
        }
      }
    }
  }
}

async function toggleReaction(post: AppPost, commentId: string | null, userId: string, emoji: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  let query = supabase
    .from('reactions')
    .select('id')
    .eq('user_id', userId)
    .eq('emoji', emoji);
  query = commentId
    ? query.is('post_id', null).eq('comment_id', commentId)
    : query.eq('post_id', post.id).is('comment_id', null);
  const { data: existing, error: lookupError } = await query.limit(1).maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await supabase.from('reactions').delete().eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('reactions').insert({
    workspace_id: post.workspace_id,
    post_id: commentId ? null : post.id,
    comment_id: commentId,
    user_id: userId,
    emoji,
  });
  if (error) throw error;
}

async function deleteComment(commentId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: attachmentRows } = await supabase.from('attachments').select('bucket, object_path').eq('comment_id', commentId);
  const { data, error } = await supabase.from('comments').delete().eq('id', commentId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This message could not be deleted.');
  const pathsByBucket = new Map<string, string[]>();
  (attachmentRows ?? []).forEach((attachment) => pathsByBucket.set(attachment.bucket, [...(pathsByBucket.get(attachment.bucket) ?? []), attachment.object_path]));
  await Promise.all([...pathsByBucket].map(([bucket, paths]) => supabase.storage.from(bucket).remove(paths)));
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
  input: { title: string; description: string; projectName: string; priority: TaskPriority; tags: string[]; assigneeId: string; dueAt: string },
) {
  if (!supabase) return;
  const { error } = await supabase.from('tasks').insert({
    workspace_id: workspaceId,
    title: input.title,
    description: input.description || null,
    project_name: input.projectName || null,
    priority: input.priority,
    tags: input.tags,
    assignee_id: input.assigneeId || null,
    created_by: userId,
    status: 'todo',
    due_at: input.dueAt || null,
  });
  if (error) throw error;
}

async function updateTask(
  taskId: string,
  input: { title: string; description: string; projectName: string; priority: TaskPriority; tags: string[]; assigneeId: string; dueAt: string },
) {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('tasks')
    .update({
      title: input.title,
      description: input.description || null,
      project_name: input.projectName || null,
      priority: input.priority,
      tags: input.tags,
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

async function archiveTask(taskId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('archive_completed_task', { target_task_id: taskId });
  if (error) throw error;
}

async function createKnowledgeArticle(workspaceId: string, userId: string, input: { category: KnowledgeCategory; title: string; summary: string; content: string }) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('knowledge_articles').insert({ workspace_id: workspaceId, created_by: userId, category: input.category, title: input.title, summary: input.summary || null, content: input.content });
  if (error) throw error;
}

async function updateKnowledgeArticle(articleId: string, input: { category: KnowledgeCategory; title: string; summary: string; content: string }) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('knowledge_articles').update({ category: input.category, title: input.title, summary: input.summary || null, content: input.content }).eq('id', articleId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This article could not be updated.');
}

async function deleteKnowledgeArticle(articleId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('knowledge_articles').delete().eq('id', articleId).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This article could not be deleted.');
}

async function updateMemberRole(membershipId: string, role: WorkspaceRole) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.rpc('update_member_role', { target_membership_id: membershipId, new_role: role });
  if (error) throw error;
}

async function updateProfile(
  userId: string,
  input: { fullName: string; nickname: string; avatarUrl: string; phone: string; address: string; timezone: string; bio: string },
) {
  if (!supabase) return;
  const { data, error: basicError } = await supabase
    .from('users')
    .update({
      display_name: input.nickname,
      full_name: input.fullName,
      nickname: input.nickname,
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

function formatMessageTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
}

function formatTaskDate(value: string) {
  return new Date(`${toTaskDateKey(value)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function toTaskDateKey(value: string) {
  return value.slice(0, 10);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function groupReactions(reactions: AppReaction[]) {
  const groups = new Map<string, { emoji: string; count: number; userIds: string[] }>();
  reactions.forEach((reaction) => {
    const group = groups.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, userIds: [] };
    group.count += 1;
    group.userIds.push(reaction.user_id);
    groups.set(reaction.emoji, group);
  });
  return [...groups.values()];
}

function clampThreadWidth(width: number) {
  return Math.round(Math.min(50, Math.max(20, width)) * 10) / 10;
}

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

function getInitialChatOpen() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(CHAT_OPEN_STORAGE_KEY) !== 'false';
}

function getInitialThreadWidth() {
  if (typeof window === 'undefined') return 30;
  const savedWidth = Number(window.localStorage.getItem(THREAD_WIDTH_STORAGE_KEY));
  return clampThreadWidth(Number.isFinite(savedWidth) && savedWidth >= 20 && savedWidth <= 50 ? savedWidth : 30);
}

function normalizeSharedUrl(value: string) {
  const candidate = value.trim().replace(/[),.;!?]+$/g, '');
  if (!/^https?:\/\//i.test(candidate)) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function extractUrls(value: string) {
  const matches = value.match(/https?:\/\/[^\s<]+/gi) ?? [];
  return [...new Set(matches.map(normalizeSharedUrl).filter((url): url is string => Boolean(url)))].slice(0, 3);
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

function getKnowledgeCategoryLabel(category: KnowledgeCategory) {
  return knowledgeCategories.find((item) => item.value === category)?.label ?? category;
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
