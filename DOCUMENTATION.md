# StreamCore — Engineering Documentation

> Contextual memory for AI agents (Claude / Cursor) and human contributors. This file is the
> source of truth for what StreamCore is, how it's built, and how to ship to it safely.
> When in doubt, read the linked source files — comments inline in the code are written for
> the same audience and stay current.

---

## 1. Project overview

**StreamCore** is a high-performance, professional-grade streamer dashboard. The product is a
single in-browser command centre that consolidates the tools a Twitch streamer normally has to
juggle across OBS, browser tabs, and side apps:

- Real-time chat, activity feed, and EventSub-driven stream state
- An OBS-style sound mixer with per-source faders, lock state, and orientation toggle
- A draggable / resizable dock-based "Live Dashboard" persisted per Twitch channel
- Multi-account permissioning so moderators can operate the same channel as the broadcaster
- OAuth integrations with Twitch (Helix + IRC + EventSub) and Spotify (playback bridge)

### Design philosophy
- **Compact, high-density information**: every dock is content-first; chrome (titles, status
  pills, decorative borders) is minimized so the user spends pixels on data, not framing.
- **Electric Purple on near-black** (`#A855F7` on `hsl(240 6% 10%)`-derived greys). Defined
  centrally in `tailwind.config.ts` under `theme.extend.colors.primary` and
  `theme.extend.boxShadow.glow-purple`. Avoid one-off accent colours.
- **Dark mode only**. `<html class="dark">` is hard-coded in `app/layout.tsx` and no theme
  toggle exists by design.
- **Pixel-precise direct manipulation**: drag, resize, and snap are first-class. The dashboard
  grid runs at 128 columns × 15px rowHeight with `compactType={null}`, so docks land exactly
  where the user drops them.
- **Technical isolation between Staging and Production** at the database, OAuth-app, and
  environment-variable level — see [§3](#3-environment-isolation--vercel).

---

## 2. Architecture & tech stack

### Runtime stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15** (App Router) | `app/` directory, React 19, RSC by default, `"use client"` only where state/effects are required. Hard-pinned via `package.json`. |
| Language | TypeScript 5.8 | `tsconfig.json` is strict. CI runs `tsc --noEmit`. |
| Styling | Tailwind CSS 3.4 | Theme extensions in `tailwind.config.ts`; global resets and bespoke `react-grid-layout` overrides in `app/globals.css`. |
| Auth | **Auth.js (NextAuth v5 beta)** with Prisma Adapter | `auth.ts` configures Twitch + Spotify providers, database sessions, and a `signIn` callback that mirrors fresh OAuth tokens onto the existing `Account` row (PrismaAdapter does not refresh tokens on re-link by itself). |
| Database | **PostgreSQL hosted on Supabase** via **Prisma 6** | Connection pooling through Supabase's transaction pooler (`:6543`). The Prisma client in `lib/prisma.ts` rewrites the URL at runtime to inject `pgbouncer=true` and `sslmode=require` to satisfy Supabase + serverless requirements. |
| Real-time | Twitch EventSub WebSocket + IRC WebSocket + Spotify polling | All real-time work happens client-side. Server is stateless (Vercel functions) and only handles auth handshakes and persistence. |
| Animation | Framer Motion 12 | Used for activity-feed row springs and sidebar transitions. `useIsAnyDockDragging()` (`components/dashboard/useDockDragging.ts`) gates `layout` animations during drag/resize so contents don't rubber-band behind the dock card. |
| Drag / resize | `react-grid-layout` 1.5 | Custom collision resolver in `components/dashboard/DashboardGrid.tsx` (`applyIntruderShrink` + `resolveCollision` + `pushUntilClear`). RGL is used purely for grid math, drag tracking, and item rendering — collision handling is ours. |
| Deployment | **Vercel (Hobby Tier)** | Function timeouts (10s on Hobby) drive design decisions: long Twitch handshakes are chunked, EventSub registration is parallelized with `Promise.allSettled`, and chat backfill is bounded. |

### Repository layout (top-level)

```
app/                Next.js App Router
  api/              Route handlers (all `runtime = "nodejs"` where they touch Prisma)
  app/              Authenticated app shell — every page lives under /app
  login/            Branded sign-in screen (server component + client form)
  layout.tsx        Root layout — Inter font, AuthSessionProvider, I18nProvider, html.dark
components/
  app/              App-shell providers: sidebar context, session selection, dashboard scope
  auth/             Auth.js session wrapper
  dashboard/        Live Dashboard grid + dock implementations
    docks/          One file per dock; consumes DockShell for chrome
  sections/         Marketing/landing components (Hero, Sidebar, etc.)
  ui/               Shadcn-derived primitives (button, dropdown-menu, popover, tabs, …)
lib/                Server- and client-shared helpers (prisma, tokens, twitch-irc,
                    dashboard-layout-defaults, twitch-eventsub-types, etc.)
prisma/             schema.prisma + numbered migrations
scripts/            prisma-env.mjs — loads .env / .env.local before running prisma CLI
```

---

## 3. Environment isolation & Vercel

StreamCore runs two fully isolated environments off the same repo. The isolation is enforced
at every external dependency, not just at the application layer.

### Branch ↔ environment mapping

| Git branch | Vercel environment | Default URL | Purpose |
|---|---|---|---|
| `main` | **Production** | the production custom domain (or `streamcore.vercel.app`) | The live product. Only commits that have passed staging land here. |
| `staging` | **Preview** | `https://streamcore-git-staging-timosteinz-2754s-projects.vercel.app` | Integration testing against a separate Supabase project and separate Twitch/Spotify OAuth apps. Fully prod-shaped but with disposable data. |
| Feature branches | Preview (per branch) | `…-git-<branch>-…vercel.app` | Reviewer-only previews; reuse the staging Twitch app's redirect URI list. |

> **Note on the staging branch:** at the time of writing the staging branch has been deleted
> locally and remotely (see commit history). The Vercel project, environment variables, and the
> staging deployment URL above remain provisioned — recreating the branch (`git checkout -b
> staging && git push -u origin staging`) re-attaches it to the same Preview environment.

### Isolation strategy

| Layer | Production (`main`) | Staging (`staging` / previews) |
|---|---|---|
| Supabase project | Dedicated Postgres project; never receives test data | Separate Supabase project; safe to wipe / reset |
| Twitch OAuth app | Dedicated `TWITCH_CLIENT_ID`/`SECRET` with **only** the production redirect URI registered | Separate Twitch app whose redirect URI list includes the staging URL and any per-branch preview URLs |
| Spotify OAuth app | Dedicated Spotify Dashboard app | Separate Spotify app |
| `AUTH_SECRET` | Unique 32-byte secret | Different 32-byte secret — sessions never cross environments |
| `AUTH_URL` | `https://<prod-domain>` | `https://streamcore-git-staging-timosteinz-2754s-projects.vercel.app` |

### Vercel environment-variable scoping

Variables are scoped via Vercel's three target environments. The matrix below is the source of
truth for what needs to be set where; `auth.ts`, `lib/prisma.ts`, `lib/tokens.ts`, and the
Twitch/Spotify API routes will all surface a clear "MISSING_…" error if a value is absent.

| Variable | Production | Preview (staging) | Development (`.env.local`) | Notes |
|---|:---:|:---:|:---:|---|
| `AUTH_SECRET` | ✅ prod value | ✅ staging value | ✅ any 32-byte value | Generate with `openssl rand -base64 32`. Different per environment. |
| `AUTH_URL` | ✅ prod origin | ✅ staging origin | ✅ `http://localhost:3000` | Must match the exact origin the user sees, no trailing slash. |
| `DATABASE_URL` | ✅ prod Supabase pooler (`:6543`, `pgbouncer=true`) | ✅ staging Supabase pooler | ✅ pooler URL of choice | Used by `@prisma/client` at runtime. |
| `DIRECT_URL` | ✅ prod session pooler (`:5432`) | ✅ staging session pooler | ✅ same shape | Used **only** by Prisma Migrate; transaction pooler hangs migrations. |
| `TWITCH_CLIENT_ID` / `_SECRET` | ✅ prod Twitch app | ✅ staging Twitch app | ✅ dev app | Redirect URI on the Twitch app **must** be `{AUTH_URL}/api/auth/callback/twitch` exactly. |
| `SPOTIFY_CLIENT_ID` / `_SECRET` | ✅ prod Spotify app | ✅ staging Spotify app | ✅ dev app | Redirect URI: `{AUTH_URL}/api/auth/callback/spotify`. |
| `AUTH_DEBUG` | unset | optional `"true"` while debugging | optional | Toggles verbose `[auth]` server logs (`auth.ts:debug`). |
| `AUTH_DIAG` | optional, short-lived | optional | optional | Enables `GET /api/debug/auth` which reports boolean health only (never secrets). |
| `NEXT_PUBLIC_APP_NAME` | `"StreamCore"` | `"StreamCore"` | `"StreamCore"` | Public-facing label. |

> **PgBouncer caveat:** when `DATABASE_URL` uses port `6543` (Supabase transaction pooler),
> `lib/prisma.ts` automatically appends `pgbouncer=true` so Prisma disables prepared statements
> (otherwise Postgres errors with `42P05 prepared statement … already exists`). `DIRECT_URL`
> must point at the session pooler (`:5432`) so Prisma Migrate can actually run.

---

## 4. Feature deep-dive

### 4.1 Live Dashboard grid

Core: `components/dashboard/DashboardGrid.tsx` + `lib/dashboard-layout-defaults.ts`.

- **Grid resolution**: v3 = 128 columns × 15px row height with `margin=[4, 8]` and
  `containerPadding=[0, 0]`. The 4 px horizontal step lines up with the 12 px background grid
  on typical desktop widths.
- **Free placement**: `compactType={null}` + `allowOverlap` + `preventCollision={false}` —
  docks never auto-pack to the top.
- **Collision model**: our `applyIntruderShrink` resolver runs on every drag/resize tick. It
  prefers to **shrink** an underlying dock toward its `minW`/`minH`, falling back to
  **shifting** it (via `pushUntilClear`) when shrinking would violate the minimum. The
  resolver passes the full layout to `resolveCollision` so shifts can't create secondary
  overlaps. The result is the guarantee: **no two docks ever overlap on commit.**
- **In-flight preview**: while the user is mid-drag, `layouts` state keeps every non-intruder
  dock at its pre-drag size, and `projectedLayout` mirrors the resolver's output. Affected
  docks fade their body (`.sv-dock-shrinking > *` → opacity 0.18) and the projected slot is
  drawn as a purple-outlined overlay using `calc()` expressions — no measured pixel width
  required, so the overlay never desynchronizes from the grid on a HMR cycle.
- **Persistence**: per-user × per-channel rows in the `DashboardLayout` Prisma table
  (`layoutsJson`, `visibleJson`, `docksLockedJson`). Saved via debounced patches through
  `POST /api/dashboard-layout`. Layout JSON is wrapped in a `{ __v: 3, layouts }` envelope,
  and `parseStoredLayouts` migrates v1 (16 cols) and v2 (32 cols) layouts forward.
- **Docks**: `streamPreview`, `liveChat`, `activityFeed`, `quickActions`, `quickClip`,
  `spotifyBridge`, `soundMixer`, `streamInfo`. Each implements the same shape (`onClose`,
  `dockLocked`, `onToggleDockLock`) and renders content inside `DockShell` for consistent
  chrome.

### 4.2 Sound Mixer

Source: `components/dashboard/docks/SoundMixerDock.tsx`.

- **OBS-style narrow channel strips** replacing the original card-based mixer. Strips are
  arranged with `flex justify-center` so they share the available width fluidly; each strip
  is `flex-1 min-w-[40px] max-w-[68px]` (vertical) or `flex-1 min-h-[36px]` (horizontal).
- **Orientation toggle** in the dock header — vertical (`Columns3`) ↔ horizontal (`Rows3`).
  Persisted in `localStorage` under `sv_sound_mixer_orientation_v1`.
- **Custom slider track** (`SliderTrack`) built from divs, no native `<input type="range">`,
  so the tube and thumb scale pixel-perfectly with the dock. 4 px track, 10 px thumb, purple
  fill. Pointer-capture drag plus full keyboard support (arrow keys, Page Up/Down, Home/End
  → 0/100).
- **Visual rules**: no per-strip card borders; subtle `divide-x` / `divide-y` hairlines at
  `rgba(255,255,255,0.04)`; labels in `text-[10px] uppercase tracking-[0.14em] text-white/45`;
  values in `tabular-nums text-white/65`.
- **Dock metrics** (`DOCK_GRID_METRICS.soundMixer`): `minH=9`, `h=22`, `minW=14`. These were
  tuned down from earlier defaults so the dock can be shrunk to a compact strip without
  clipping. `normalizeDashboardLayoutItem` **overwrites** stored min values with the catalog's
  current values, so lowering a min in `DOCK_GRID_METRICS` propagates to already-persisted
  rows on next load.

#### Roadmap (sound mixer)
- Peak-level meters per strip driven by a planned Web Audio analyzer node.
- Real-time volume persistence to the streamer's profile, so values survive reload.
- Routing-graph hooks (mute, solo, mono fold) once an audio engine is wired in.

### 4.3 Activity Feed

Source: `components/dashboard/docks/ActivityFeedDock.tsx`,
`lib/twitch-activity-feed-model.ts`, `app/api/twitch/activity-feed/route.ts`.

- **Unified timeline** across 14 Twitch event kinds (follows, subs, gifted subs, cheers,
  channel-point redemptions, boosts, collaboration requests, goals, hype trains, polls,
  predictions, raids, shoutouts, watchstreaks). All events render in one reverse-chronological
  list — never grouped by category.
- **Hybrid data source**: a Helix snapshot at mount (server-side, scope-gated by `isSelf` and
  granted scopes) seeds historical rows; an EventSub WebSocket (`useTwitchEventSub`) layers
  live events on top with merge-on-write `localStorage` persistence (`sv_live_events_v2_…`)
  capped at 1000 rows. Gifted-sub recipients and gifter are paired into one row of the form
  `"<gifter> gifted a tier <n> sub to <recipient>"`.
- **Configurable window**: "last week" → "1 year" radio in the header, stored in
  `localStorage` (`sv_activity_feed_window_v1`).
- **Multi-select kind filter**: per-kind checkbox dropdown, persisted in
  `sv_activity_feed_filters_v1`. The filter operates on the cached state, so unchecking a kind
  doesn't drop the underlying data.
- **Real-time timestamps**: `formatActivityTimeAgo` enforces strictly monotonic units to
  avoid jumps like `7w → 1mo`.
- **Drag-aware**: `useIsAnyDockDragging()` flips `motion.div`'s `layout` prop off during a
  gesture so rows translate with the dock as a rigid block instead of rubber-banding.

### 4.4 Live Chat & moderation

Sources: `components/dashboard/docks/LiveChatDock.tsx`,
`components/dashboard/docks/useTwitchChat.ts`, `lib/twitch-irc.ts`,
`app/api/twitch/chat-credentials`, `app/api/twitch/chat-badges`,
`app/api/twitch/chat-archive(/delete)`, `app/api/twitch/chat-backfill`,
`app/api/twitch/moderate`, `components/dashboard/UserProfilePopover.tsx`.

- **Live chat** runs entirely in the browser over the Twitch IRC WebSocket
  (`wss://irc-ws.chat.twitch.tv`). The server only mints credentials and merges global +
  channel chat badges.
- **Soft-delete UX**: `CLEARMSG` / `CLEARCHAT` flag rows with `deletedAt`. They're rendered
  as `<name> (show message) <user timed out | banned | message deleted>`. Revealed text is
  grey and italic — no strikethrough.
- **Persistent history**: every observed PRIVMSG is batched and uploaded to
  `ChatMessageArchive` via `POST /api/twitch/chat-archive`. `GET` paginates by `before`
  (epoch ms) for infinite scroll. Soft-deletes go through
  `POST /api/twitch/chat-archive/delete` and best-effort `navigator.sendBeacon`.
- **Historical backfill**: `POST /api/twitch/chat-backfill` proxies
  `recent-messages.robotty.de` so users see context immediately on first load, with
  client-side throttling via `localStorage`.
- **User profile popover**: Twitch-style card. Tabs for Messages (infinite scroll over
  archive), Warnings, Timeouts, Bans, Comments. Moderation actions (ban / timeout for
  1s..7d / unban / warn) call `POST /api/twitch/moderate`, which proxies Helix with the
  acting user as `moderator_id`.

### 4.5 Auth pipeline

Source of truth: `auth.ts`.

**Providers** — both via Auth.js v5 with Prisma Adapter and `session: { strategy: "database" }`:

- **Twitch** (`next-auth/providers/twitch`). Requested scopes (single source of truth):

  ```
  openid · user:read:email · chat:read · chat:edit
  channel:manage:broadcast
  moderator:read:followers · channel:read:subscriptions · bits:read
  channel:read:redemptions · moderator:manage:shoutouts
  channel:read:polls · channel:read:predictions
  channel:read:hype_train · channel:read:goals
  moderator:manage:banned_users · moderator:manage:warnings
  ```

- **Spotify** (`next-auth/providers/spotify`). Scopes:
  `user-read-currently-playing user-modify-playback-state user-read-playback-state`.

**Redirect URIs.** Twitch and Spotify both require an exact-match list. We register:

| Environment | Twitch redirect URI | Spotify redirect URI |
|---|---|---|
| Production | `https://<prod-domain>/api/auth/callback/twitch` | `https://<prod-domain>/api/auth/callback/spotify` |
| Staging | `https://streamcore-git-staging-timosteinz-2754s-projects.vercel.app/api/auth/callback/twitch` | `https://streamcore-git-staging-timosteinz-2754s-projects.vercel.app/api/auth/callback/spotify` |
| Local dev | `http://localhost:3000/api/auth/callback/twitch` | `http://localhost:3000/api/auth/callback/spotify` |

Per-developer / per-feature-branch URLs are added to the **staging** Twitch app so previews
work without touching the prod app.

**Token refresh.** `lib/tokens.ts` exposes:

- `getProviderAccessToken(userId, provider)` — returns a valid access token, refreshing via
  the provider's refresh-token endpoint when the stored `expires_at` is within 60 s. Refreshed
  tokens are persisted back to the same `Account` row.
- `forceRefreshProviderToken(userId, provider)` — used by the activity-feed and EventSub
  registration routes after `/oauth2/validate` reports a revoked token (e.g. the user
  disconnected the app on twitch.tv since their last sign-in).

**Token mirror on re-auth.** PrismaAdapter writes tokens to `Account` only on the *first* OAuth
link. When the user signs in again — for example to grant a newly-added scope — Twitch issues
fresh tokens and invalidates the old ones, but the adapter ignores them. The `signIn`
callback in `auth.ts` mirrors `access_token`, `refresh_token`, `expires_at`, `scope`,
`token_type`, `id_token`, and `session_state` onto the existing row via `updateMany`. Without
this, every re-auth would silently break Helix calls until the user wiped their session.

**Consent log.** Every successful link and every re-auth append a row to `UserConsent`
(`provider`, `scopes`, `grantedAt`). Used for audit + future GDPR export.

---

## 5. API & database schema

### 5.1 Prisma schema intent

Full schema in `prisma/schema.prisma`. Eight models, grouped:

**Auth.js core** (do not alter shape — PrismaAdapter depends on it):

| Model | Purpose |
|---|---|
| `User` | Identity record. Holds back-references to all StreamCore-owned models. |
| `Account` | OAuth credentials per (provider, providerAccountId). Our `signIn` callback mirrors fresh tokens here. |
| `Session` | DB-backed session token cookie. |
| `VerificationToken` | Email verification, unused today but required by the adapter. |

**StreamCore-owned models**:

| Model | Purpose |
|---|---|
| `DashboardLayout` | One row per (user, channelTwitchId). `layoutsJson` is the versioned envelope, `visibleJson` is the array of dock keys, `docksLockedJson` is the per-dock lock map. |
| `UserConsent` | Append-only log of OAuth scopes granted per provider per moment in time. |
| `ChannelPermission` | Granted access of a user to a channel that isn't theirs. Roles: `BASIC_EDITOR`, `EDITOR`, `FULL_CONTROL`. Drives the "operate someone else's channel" flow. |
| `PermissionInvite` | Single-use, optionally-expiring token that turns into a `ChannelPermission` row on accept. |
| `ChatMessageArchive` | Persistent IRC PRIVMSG log per channel. `BigInt` timestamp, soft-delete on CLEARMSG/CLEARCHAT, unique on `(channelTwitchId, ircId)` for idempotent upserts. |

### 5.2 API surface

Every route is a Next.js App Router route handler (`runtime = "nodejs"`, `dynamic = "force-dynamic"`
where it touches Prisma). All authenticated routes start with `await auth()` and return `401`
on missing session.

| Route | Method(s) | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | `GET`/`POST` | Auth.js v5 handler (re-exported from `auth.ts`). |
| `/api/debug/auth` | `GET` | Auth health probe (gated by `AUTH_DIAG=1`). Reports booleans only — never tokens or secrets. |
| `/api/dashboard-layout` | `GET`/`POST` | Load/save layout + visibility + dock locks per `channelTwitchId`. Accepts either full `layoutsJson` or a partial `layoutsPatchJson` per breakpoint. |
| `/api/channel-permissions` | `GET` | List channels the caller has access to (self + `ChannelPermission` rows). |
| `/api/permissions/invite` | `POST` | Mint a `PermissionInvite` token. |
| `/api/permissions/accept` | `POST` | Consume an invite, create the `ChannelPermission`. |
| `/api/permissions/revoke` | `POST` | Drop a `ChannelPermission`. |
| `/api/permissions/update` | `POST` | Change a permission's role. |
| `/api/twitch/activity-feed` | `GET` | Helix snapshot of follows, subs, redemptions, polls, predictions over a window. Force-refreshes the token on `/oauth2/validate` failure. |
| `/api/twitch/channel-info` | `GET` | Stream info (title, category, tags, language). |
| `/api/twitch/search-categories` | `GET` | Helix category search for the "update broadcast" UI. |
| `/api/twitch/chat-credentials` | `GET` | Mints the bearer token the IRC WebSocket needs. |
| `/api/twitch/chat-badges` | `GET` | Global + channel chat badges, merged. |
| `/api/twitch/chat-archive` | `GET`/`POST` | Paginated read by `userTwitchId`/`userLogin` (≤ 100 rows per page) + batched ingest (≤ 50 rows per request). |
| `/api/twitch/chat-archive/delete` | `POST` | Soft-delete a message by `ircId`. |
| `/api/twitch/chat-backfill` | `POST` | Proxy `recent-messages.robotty.de` for historical chat on join. |
| `/api/twitch/moderate` | `POST` | Ban / timeout (1s–14d) / unban / warn via Helix. Caller's bearer is used as `moderator_id`. |
| `/api/twitch/user-profile` | `GET` | Detailed Helix user profile for the popover (created_at, follower edges, ban status). |
| `/api/twitch/eventsub/subscribe` | `POST` | Registers every `EVENTSUB_SUBSCRIPTION_DEFS` entry the user's scopes allow for a WebSocket sessionId. |
| `/api/spotify/now-playing` | `GET` | Now-playing payload for the Spotify Bridge dock. |

### 5.3 Handshake pattern

Every Twitch/Spotify route follows the same flow so failures surface consistently:

1. `await auth()` → 401 if no session.
2. `getProviderAccessToken(userId, provider)` to get a known-fresh access token (refresh
   rotation happens transparently).
3. Call Helix / Spotify with `Authorization: Bearer <token>` + `Client-Id: <env>`.
4. On any 401 from the provider, fall back to `forceRefreshProviderToken` and retry once.
5. Map provider HTTP status + message into the response so the client can render the exact
   reason (especially for moderation actions where Twitch's text is user-facing).

---

## 6. Developer workflow

### 6.1 Branch flow

```
feature/<topic>  →  staging  →  main
       │             │           │
       │             │           └──  auto-deploys to Production
       │             └────────────── auto-deploys to the staging Preview URL
       └─────────────────────────── per-branch Preview URL (also under the staging Twitch app)
```

- Branch off `main` for any new work. Push early — Vercel will spin up a Preview URL.
- When the feature is integration-ready, open a PR into `staging` and let it deploy to the
  staging Preview. Verify against the **staging** Twitch and Supabase projects.
- Once stable on staging, open a PR from `staging` into `main`. Production deploys on merge.
- Hotfixes follow the same path but with a shorter staging soak.

### 6.2 Database migrations

Prisma is invoked through `scripts/prisma-env.mjs`, which loads `.env` then `.env.local` so
the `DATABASE_URL` / `DIRECT_URL` pair are always present:

| Command | When to use it |
|---|---|
| `npm run db:migrate` | Create + apply a new migration locally (`prisma migrate dev`). |
| `npm run db:migrate:deploy` | Apply pending migrations against the environment in scope (used by CI / Vercel build hooks if/when wired). |
| `npm run db:push` | **Staging fast lane**: push the schema to the staging Supabase project without committing a migration. Use this for short-lived experiments — anything that lands on `main` must be a proper migration. |
| `npm run db:studio` | Prisma Studio against the configured `DATABASE_URL`. |
| `npm run db:generate` | Re-generate the Prisma client (also runs automatically via `postinstall`). |
| `npm run db:migrate:baseline` | One-shot helper to mark the three legacy "init" migrations as applied on a fresh DB, so the migration log matches existing rows. |

> **Staging migration policy:** `db:push` is *only* acceptable on the staging database. The
> production Supabase project is migrated exclusively via numbered migrations on `main` so
> we always have a reversible history.

### 6.3 Local development

```bash
# Prereqs: Node.js LTS, a Supabase project (or any Postgres), Twitch + Spotify dev apps.
cp .env.example .env.local      # fill in the values
npm install                     # postinstall runs `prisma generate`
npm run db:migrate              # apply migrations to your dev DB
npm run dev                     # http://localhost:3000
```

The login screen lives at `/login` and is the only unauthenticated page besides the marketing
landing at `/`. Authenticated app pages are mounted under `/app/*`.

### 6.4 Conventions for contributors (human or AI)

- **Comments explain "why", not "what".** The existing code is heavily commented at the
  decision-point level — match that tone. Don't restate what the next line obviously does.
- **No new top-level Markdown files** unless explicitly requested. This file and `README.md`
  are the only documentation surface today.
- **Server vs client boundary**: Prisma access lives behind API routes and server components.
  Never import `@/lib/prisma` into a `"use client"` file.
- **Token access**: never read `account.access_token` directly. Always go through
  `getProviderAccessToken` / `forceRefreshProviderToken` so refresh rotation is honoured and
  the consent log stays accurate.
- **Layout edits**: when changing dock min/default sizes, bump `DASHBOARD_LAYOUT_VERSION`
  in `lib/dashboard-layout-defaults.ts` and write a `migrateLayoutsVNToVN+1` if any axis
  changes. The catalog is authoritative — `normalizeDashboardLayoutItem` overwrites stored
  `minH`/`minW`.
- **Drag/resize visuals**: changes that affect the in-flight overlay or `.sv-dock-shrinking`
  styling must keep the contract: `outline = projected slot`, `faded body = current slot`. Any
  dock animating its inner contents must gate `layout` animations behind
  `useIsAnyDockDragging()` to avoid rubber-band.
- **Type check before pushing**: `npx tsc --noEmit` runs in seconds against the cached build
  info; treat it as the local CI gate.

---

## 7. Where to look next

| Topic | Start here |
|---|---|
| How a dock is built | `components/dashboard/docks/DockShell.tsx` + any specific dock file |
| The drag/resize collision algorithm | `components/dashboard/DashboardGrid.tsx` — `pushUntilClear`, `resolveCollision`, `applyIntruderShrink` |
| Layout persistence + migrations | `lib/dashboard-layout-defaults.ts` |
| Realtime Twitch events | `components/dashboard/docks/useTwitchEventSub.ts` + `lib/twitch-eventsub-types.ts` |
| Chat archive lifecycle | `components/dashboard/docks/useTwitchChat.ts` + `app/api/twitch/chat-archive/route.ts` |
| Token refresh + scope handling | `auth.ts` + `lib/tokens.ts` |
| Sidebar / app shell | `components/app/AppShellLayout.tsx` + `components/sections/Sidebar.tsx` |
| Sound mixer architecture | `components/dashboard/docks/SoundMixerDock.tsx` |
