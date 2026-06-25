# Tribu CTO Technical Specification

## 1. Product Definition

Tribu is a post-based collaborative camp for teams that want decisions, files, tasks, and discussion history to stay grouped around the topic that created them. It replaces channels with trails plus active posts.

Core product rules:

- Every discussion starts as a post.
- Replies, files, tasks, decisions, and summaries live inside the post.
- Recent activity bumps posts to the top of the active feed.
- Trails provide access boundaries without recreating channel clutter.
- The data model is ready for a future auditable AI layer, but AI is not active in the current app.

## 2. System Architecture

Production target:

- Frontend: Next.js 15, React, TypeScript, TailwindCSS, ShadCN UI, Framer Motion.
- Backend: Supabase Postgres, Supabase Auth, Supabase Realtime, Supabase Storage, Edge Functions.
- Future AI: provider adapter layer to be implemented after the core collaboration workflows are stable.
- Search: Postgres full-text search first, pgvector semantic search second.
- Payments: Stripe subscriptions, checkout, customer portal, webhooks.
- Email: Resend transactional email and digests.
- Monitoring: Sentry for exceptions, PostHog for product analytics.
- Deployment: Vercel for web, Supabase hosted Postgres/Storage/Auth, Docker for local and enterprise self-hosting.

Recommended runtime services:

- `web`: Next.js app router, server actions, route handlers.
- `worker`: background task processor for email, imports, embeddings, and future async jobs.
- `supabase`: Postgres, Storage, Auth, Realtime.
- `edge-functions`: Stripe webhooks, OAuth callbacks, upload signing, agent dispatch.

## 3. Database Schema

The initial Supabase migration is in `supabase/migrations/20260624153000_initial_tribu_schema.sql`.

Primary entities:

- `users`: app profiles linked to Supabase Auth.
- `workspaces`: internal table for camp account boundaries, Chief, brand, security, and plan.
- `memberships`: internal table for camp role model: owner (Chief in the UI), admin, member, guest.
- `spaces`: internal table for public, private, or invite-only trails.
- `space_memberships`: internal membership table for private and invite-only trails.
- `posts`: living collaboration threads with full-text and vector search fields.
- `comments`: nested discussion, decisions, and agent replies.
- `reactions`: post and comment reactions.
- `attachments`: Supabase Storage metadata and versions.
- `tasks`: work created from posts or comments.
- `ai_agents`: provider, model, instructions, permissions, memory profile.
- `ai_messages`: auditable agent prompt/response records.
- `notifications`: in-app notification stream.
- `subscriptions`, `billing_events`: Stripe state.
- `activity_logs`, `audit_logs`: operational and security records.

Indexes:

- Camp and trail feed indexes by `last_activity_at`.
- GIN full-text indexes on posts and comments.
- IVFFlat vector indexes for semantic search.
- Notification, task, activity, audit, and future AI-message lookup indexes.

## 4. Permission Model

Tribu intentionally avoids custom role hierarchies.

Camp roles:

- Chief: billing, transfer ownership, delete camp, security, all admin controls.
- Admin: members, settings, integrations, analytics, archived content.
- Member: create posts, reply, upload files, create tasks, use agents, search.
- Guest: invited trails/posts only, limited collaboration.

Access is evaluated in this order:

1. Camp role.
2. Trail visibility or membership.
3. Content state: open, read-only, locked, archived.

Future AI workers must inherit camp and trail visibility. They cannot invite users, manage billing, alter settings, or escalate permissions.

## 5. API Design

Use Next.js route handlers and server actions backed by Supabase service clients.

Core route groups:

- `/api/workspaces`: internal camp create, update, invite, branding, custom domains.
- `/api/spaces`: internal trail create, update access, manage members.
- `/api/posts`: create, edit, archive, pin, schedule, list active feed.
- `/api/comments`: reply, nest replies, mark decisions, quote.
- `/api/tasks`: create from comments, assign, status updates, due dates.
- `/api/files`: signed upload URLs, previews, version metadata.
- `/api/search`: full-text search, filters, and semantic search support.
- `/api/agents`: create agents, update permissions, dispatch, activity logs.
- `/api/billing`: checkout, customer portal, plan state.
- `/api/webhooks/stripe`: idempotent subscription event handling.

All mutating APIs validate:

- Auth session.
- Camp membership.
- Trail access.
- Content state.
- Rate limits.
- Zod input schema.

## 6. Authentication Flows

Supabase Auth providers:

- Email/password.
- Magic links.
- Google OAuth.
- Microsoft OAuth.

On first login:

1. Create `users` profile from Auth identity.
2. If invitation token exists, attach membership.
3. Otherwise create a personal trial camp.
4. Redirect to active feed.

Enterprise phase:

- SAML/SSO for Business and Enterprise.
- Domain capture and approved domains.
- SCIM provisioning after SSO launch.

## 7. Realtime Architecture

Supabase Realtime channels:

- `workspace:{workspace_id}:feed`: post activity, pins, archives.
- `post:{post_id}:thread`: comments, reactions, agent replies.
- `user:{user_id}:notifications`: mentions, tasks, and camp updates.
- `workspace:{workspace_id}:presence`: online users and active agents.

Activity bumping:

- Inserting a comment triggers `posts.last_activity_at = now()`.
- The active feed sorts by `last_activity_at desc`.
- Pinned posts remain visually prominent but do not override search relevance.

## 8. Future AI Architecture

AI is intentionally out of scope for the current production shell. The database keeps future-ready tables so AI can be added later without redesigning camp permissions.

Agent lifecycle:

1. User mentions or assigns an agent in a post.
2. Server validates agent permissions for the post trail.
3. Job is written to `ai_messages`.
4. Worker builds thread context, respecting content permissions.
5. Provider adapter calls the selected model provider.
6. Worker writes response as a comment and links `ai_messages.comment_id`.
7. Audit logs capture actor, prompt metadata, token use, provider, and status.

Default agent templates will be defined when the AI layer is implemented.

Memory:

- Thread memory is scoped to the post.
- Camp memory is explicit and admin-managed.
- Agents never read restricted trails unless invited and permitted.

## 9. File Storage Architecture

Supabase Storage buckets:

- `workspace-files`: private uploads.
- `public-assets`: logos, avatars, public brand media.
- `exports`: generated archives and compliance exports.

File controls:

- Signed upload URLs.
- MIME allowlist and size limits.
- Virus scanning integration before enterprise launch.
- Version tracking through `attachments.version`.
- Image optimization through Next.js image routes or a storage transform worker.

## 10. Subscription System

Plans:

- Free: small teams.
- Pro: unlimited posts and collaboration history.
- Business: SSO, audit logs, admin controls.
- Enterprise: multi-camp, compliance, dedicated support.

Stripe integration:

- Checkout for upgrades.
- Customer portal for plan changes and invoices.
- Webhooks write `subscriptions` and `billing_events`.
- Future AI usage quotas should be enforced by camp plan and monthly usage counters.

## 11. Security Model

Baseline controls:

- Row Level Security on all tenant data.
- Server-only service role key.
- Short-lived signed upload URLs.
- Zod input validation.
- Per-user and per-camp rate limiting.
- Audit logs for admin actions and future automated workers.
- Encryption at rest through Supabase managed Postgres and Storage.
- Least-privilege agent permissions.
- GDPR deletion/export jobs.
- SOC2-ready logging, access review, incident response, and change management process.

## 12. Folder Structure

Production Next.js structure:

```txt
app/
  (auth)/
  (workspace)/
  api/
components/
  app-shell/
  posts/
  comments/
  agents/
  tasks/
  files/
  admin/
lib/
  auth/
  supabase/
  permissions/
  ai/
  billing/
  search/
  validations/
supabase/
  migrations/
  functions/
tests/
  unit/
  integration/
  e2e/
docs/
```

The current runnable shell remains Vite-based in this repository so the product concept can be previewed immediately. The target production migration path is Next.js app router with the same component and data boundaries.

## 13. UI Wireframes

Design direction:

- Primary mark color: golden yellow `#E9B93E` with charcoal foreground `#211A16`.
- Primary action color: deep earth `#8F4F2E`, with charcoal `#332722` for high-emphasis controls.
- Accent warmth: parchment `#F6EAD4`, light paper `#FFFAF0`, and muted gold `#DFC9A4`.
- Supporting contrast: restrained blues and teals only for system state, search, decisions, and knowledge surfaces.
- Cultural motif layer: subtle Baybayin, three-stars-and-sun logo geometry, and low-opacity pre-colonial-inspired patterns. These should support the product atmosphere without overpowering core workflow clarity.

Primary camp layout:

```txt
Left sidebar        Main feed                    Thread panel
Camp switcher       Metrics                      Post title
Navigation          Sort controls                Original post
Trails              Active post list             Replies
Camp tools          Search                       Thread composer
```

Admin layout:

```txt
Settings nav        Security and billing panels  Audit log drawer
Members             Agent permissions            Plan usage
Trails              Integrations                 Domain/SSO
```

Mobile layout:

```txt
Top camp bar
Search
Sort tabs
Post list
Thread opens as full-screen route or sheet
```

## 14. Component Architecture

Core components:

- `AppShell`: camp chrome, theme, responsive layout.
- `SpaceNav`: visible trails and access state.
- `ActiveFeed`: ranking, filters, infinite scroll.
- `PostCard`: status, tags, author, excerpt, activity metadata.
- `ThreadPanel`: original post, comments, composer, agent assignment.
- `AgentPicker`: permission-aware agent dispatch.
- `TaskList`: tasks extracted from discussions.
- `KnowledgePanel`: post-to-document conversion.
- `AdminPanels`: roles, billing, security, audit logs.

State strategy:

- Server components for initial data.
- Supabase Realtime subscriptions for live updates.
- Optimistic mutations for replies, reactions, and task state.
- URL state for selected post and filters.

## 15. Deployment Setup

Vercel:

- Deploy web app from main branch.
- Environment variables managed per environment.
- Preview deployments for pull requests.

Supabase:

- Migrations applied through Supabase CLI.
- Branching or separate projects for dev, staging, production.
- Storage buckets created by migration script or bootstrap command.

Docker:

- Local app container for repeatable development.
- Compose file can attach Postgres/Supabase stack during self-hosting work.

## 16. CI/CD Pipeline

GitHub Actions should run:

- Install.
- Type check.
- Unit tests.
- Build.
- Supabase migration lint.
- Playwright smoke tests.
- Sentry source map upload on production release.

Required branch protections:

- Passing CI.
- Code owner approval for auth, billing, security, and migrations.
- No direct production database changes outside migrations.

## 17. Testing Strategy

Unit tests:

- Permission helpers.
- Feed ranking.
- Search query builders.
- Agent provider adapters.
- Billing state reducers.

Integration tests:

- Camp onboarding.
- Invite acceptance.
- Trail access.
- Post/comment/task lifecycle.
- Agent dispatch and audit records.
- Stripe webhook idempotency.

E2E tests:

- Create camp.
- Create private trail.
- Create post and reply.
- Reply in a thread.
- Convert decision to knowledge doc.
- Upgrade plan.

## 18. Monitoring Strategy

Sentry:

- Frontend errors.
- Route handler exceptions.
- Worker failures.
- Release tracking.

PostHog:

- Activation: camp created, first post, first comment, first invite.
- Collaboration: active posts, reply rate, decision logs.
- Future AI: dispatch rate, completion latency, accepted outputs.
- Retention: weekly active camps, search usage, notification opens.

Operational alerts:

- Future background job queue age.
- Realtime disconnect rate.
- Stripe webhook failures.
- Storage upload failures.
- Postgres CPU, slow queries, connection saturation.

## 19. Launch Checklist

Pre-launch:

- RLS verified with automated tests.
- Billing webhooks idempotent.
- Agent permissions audited.
- Rate limits active.
- Privacy policy, terms, and DPA ready.
- Backup and restore procedure tested.
- Sentry and PostHog enabled.
- Email deliverability configured.
- Support runbooks written.

Launch readiness:

- Free and Pro onboarding tested end to end.
- Business plan gates in place.
- Migration/import path documented.
- Admin audit log visible.
- Search response times under target.
- Background job failures degrade gracefully.

Scale target:

- Tens of thousands of users.
- Millions of posts and comments.
- Active feed queries under 200 ms at p95 with indexes and pagination.
- Future AI jobs processed asynchronously with quota and retry controls.
