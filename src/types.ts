export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';
export type SpaceAccess = 'public' | 'private' | 'invite_only';
export type ContentState = 'open' | 'read_only' | 'locked' | 'archived';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'canceled';
export type SortMode = 'active' | 'newest' | 'insights' | 'assigned' | 'archived';
export type ViewMode = 'feed' | 'tasks' | 'knowledge' | 'admin';

export interface AppProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string | null;
  phone?: string | null;
  address?: string | null;
  bio?: string | null;
}

export interface AppWorkspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  logo_url: string | null;
  brand_color: string | null;
  plan: 'free' | 'pro' | 'business' | 'enterprise';
  created_at: string;
  role?: WorkspaceRole;
}

export interface AppSpace {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  access: SpaceAccess;
  description: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AppPost {
  id: string;
  workspace_id: string;
  space_id: string;
  author_id: string;
  title: string;
  body: string;
  state: ContentState;
  pinned_at: string | null;
  archived_at: string | null;
  last_activity_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  has_decision?: boolean;
}

export interface AppComment {
  id: string;
  workspace_id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_id: string;
  body: string;
  is_decision: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppAttachment {
  id: string;
  workspace_id: string;
  post_id: string | null;
  comment_id: string | null;
  uploaded_by: string;
  bucket: string;
  object_path: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
  signed_url?: string;
}

export interface AppLinkPreview {
  url: string;
  title: string;
  description: string;
  image: string | null;
  site_name: string;
}

export interface AppReaction {
  id: string;
  workspace_id: string;
  post_id: string | null;
  comment_id: string | null;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface AppTask {
  id: string;
  workspace_id: string;
  post_id: string | null;
  title: string;
  description: string | null;
  assignee_id: string | null;
  created_by: string;
  status: TaskStatus;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}
