# Tribu

Tribu is a production-oriented collaborative camp organized around posts instead of channels. The app is a single-page, app-like layout backed by Supabase Auth, Postgres, Realtime, and Row Level Security.

## Current Scope

- Supabase magic-link authentication.
- First-run camp creation.
- Chief/admin invite links for employees and guests.
- Trail navigation.
- Post creation and active-feed ranking.
- Thread replies and decision marking.
- Task, knowledge, and admin shells connected to the production data model.
- Strict page layout where only the feed list and thread activity panel scroll.

The AI layer is intentionally not active yet. The database remains ready for future AI work, but no AI provider keys or demo agent content are required for this build.

## Environment

Create `.env.local`:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Supabase

Apply the migrations in order:

```bash
supabase db push
```

Required migrations:

- `supabase/migrations/20260624153000_initial_tribu_schema.sql`
- `supabase/migrations/20260624200000_onboarding_policies.sql`
- `supabase/migrations/20260624203000_workspace_onboarding_rpc.sql`
- `supabase/migrations/20260624204500_reload_workspace_onboarding_rpc.sql`
- `supabase/migrations/20260624210000_workspace_invitations.sql`

## Employee Sign-In

Employees and guests do not create the company camp themselves.

1. Chief or admin opens `Admin`.
2. Enter the employee email and role.
3. Copy the generated invite link.
4. Employee opens the link and signs in with the invited email.
5. After magic-link authentication, Tribu accepts the invite and adds the user to the camp.

If the invite opens while the browser is already signed in as another user, Tribu keeps the invite token and offers `Sign in with invited email`. Use that option, then request the magic link for the exact email that received the invite.

After an invite is accepted, Admins, Members, and Guests return through the normal Tribu sign-in screen. There are no separate role-specific login pages; access is loaded from their camp membership after authentication.

## Clean Start / Chief Bootstrap

If you deleted users to start fresh:

1. Sign out of Tribu if an old session is still open.
2. Sign in with the email that should become the first Chief.
3. When no memberships exist, Tribu shows `Create your Chief account`.
4. Create the first camp. The app creates the profile, camp, initial `General` trail, and `owner` membership. The UI displays this role as `Chief`.
5. Open `Admin` and invite Admin, Member, or Guest accounts by email.

Invites cannot assign another Chief. Additional people join through Admin, Member, or Guest invite links.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verify

```bash
npm run lint
npm run build
```
