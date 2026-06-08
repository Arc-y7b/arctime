# ArcTime — Architecture Document

**Last updated:** June 2026

---

## 1. Overview

ArcTime is migrating from a purely client-side app (localStorage) to a **Supabase-backed multi-user architecture**. This document captures the design decisions, data model, auth flow, security policies, and deployment topology.

### Goals

- Real user accounts (email + password)
- Calendar data persists across sessions and devices
- Friend request workflow (send → accept/decline → share calendars)
- Real-time calendar syncing between friends
- Keep the existing frontend UI as-is, only swap the data layer

---

## 2. Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Vanilla HTML/CSS/JS | Existing app; no framework migration needed |
| Hosting | GitHub Pages | Free, static, already configured |
| Auth | Supabase Auth | Built-in, handles JWTs, session management |
| Database | Supabase PostgreSQL | Relational (needed for friends/requests), RLS for per-user security |
| Real-time | Supabase Realtime | WebSocket-based subscriptions on database changes |
| Client SDK | `@supabase/supabase-js` (CDN) | Query Supabase directly from the browser |

### Why Supabase?

- **No backend server to write or deploy** — browser queries Supabase directly with Row-Level Security enforcing permissions
- **Free tier** covers our needs: 500MB database, 50K users, 2GB bandwidth
- **PostgreSQL** gives us proper relational queries for friend relationships
- **Built-in auth** with email/password, magic link, and OAuth
- **Real-time subscriptions** for live calendar updates between friends

---

## 3. Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Browser (GitHub Pages)                 │
│                                                          │
│  index.html  ───  style.css  ───  app.js                │
│                                         │                │
│                                   supabase.js            │
│                              (client initialisation)      │
│                                         │                │
└─────────────────────────────────────────┼────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
               ┌────┴─────┐        ┌──────┴──────┐        ┌────┴─────┐
               │  Supabase │        │  Supabase   │        │ Supabase  │
               │   Auth    │        │  Database   │        │ Realtime  │
               │ (GoTrue)  │        │ (PostgreSQL)│        │(WebSocket)│
               └──────────┘        └──────┬───────┘        └──────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
               ┌────┴─────┐        ┌──────┴──────┐        ┌────┴─────┐
               │ profiles │        │   events     │        │friendships│
               └──────────┘        └─────────────┘        └──────────┘
                                    friend_requests    event_attendees
```

---

## 4. Database Schema

### 4.1 Entity Relationship

```
auth.users (managed by Supabase)
    │
    └── profiles (1:1)
            │
            ├── events (1:N) — a user owns many events
            │       │
            │       └── event_attendees (N:M) — users invited to a group event
            │
            ├── friend_requests (1:N as sender)
            │
            ├── friend_requests (1:N as receiver)
            │
            └── friendships (N:M) — with user_id_1 < user_id_2 constraint
```

### 4.2 Table Definitions

#### `profiles`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK → `auth.users(id)` | Same ID as auth user |
| `username` | `TEXT` | UNIQUE | Display handle, used for friend search |
| `display_name` | `TEXT` | | Full name shown in UI |
| `avatar_url` | `TEXT` | DEFAULT | Data URL or remote URL |
| `timezone` | `TEXT` | DEFAULT 'BST' | User's preferred timezone |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | |

#### `events`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | |
| `user_id` | `UUID` | FK → `profiles(id)`, NOT NULL | Event owner |
| `title` | `TEXT` | NOT NULL | |
| `day_index` | `SMALLINT` | CHECK 0-6 | Monday=0, Sunday=6 |
| `start_time` | `TEXT` | NOT NULL | HH:MM in GMT |
| `end_time` | `TEXT` | NOT NULL | HH:MM in GMT |
| `category` | `TEXT` | DEFAULT 'hangout' | study, hangout, dinner, sports, gaming |
| `notes` | `TEXT` | DEFAULT '' | |
| `event_type` | `TEXT` | CHECK ('personal', 'group') | |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | |

#### `event_attendees`

| Column | Type | Constraints |
|--------|------|-------------|
| `event_id` | `UUID` | PK, FK → `events(id)` ON DELETE CASCADE |
| `user_id` | `UUID` | PK, FK → `profiles(id)` ON DELETE CASCADE |

#### `friend_requests`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() |
| `sender_id` | `UUID` | FK → `profiles(id)`, NOT NULL |
| `receiver_id` | `UUID` | FK → `profiles(id)`, NOT NULL |
| `status` | `TEXT` | CHECK ('pending', 'accepted', 'declined'), DEFAULT 'pending' |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() |
| | | UNIQUE(sender_id, receiver_id) |

#### `friendships`

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id_1` | `UUID` | PK, FK → `profiles(id)`, CHECK (user_id_1 < user_id_2) |
| `user_id_2` | `UUID` | PK, FK → `profiles(id)` |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() |

The `CHECK (user_id_1 < user_id_2)` constraint ensures each friendship is stored exactly once regardless of which user initiated it.

---

## 5. Row-Level Security (RLS)

RLS policies enforce that users can only access data they own or are authorised to see. All queries from the browser use the **anon key** — the service_role key is never exposed to the client.

### 5.1 Profiles

| Operation | Policy | Rationale |
|-----------|--------|-----------|
| SELECT | Everyone can read all profiles | Needed to search for users by username |
| INSERT | `auth.uid() = id` | Users can only create their own profile on sign-up |
| UPDATE | `auth.uid() = id` | Users can only edit their own profile |

### 5.2 Events

| Operation | Policy | Rationale |
|-----------|--------|-----------|
| SELECT | Own events OR events belonging to friends | Friends can see each other's calendars via the friendship join |
| INSERT | `user_id = auth.uid()` | Can only create events as yourself |
| UPDATE | Own events only | Can only edit your own events |
| DELETE | Own events only | Can only delete your own events |

The SELECT policy uses a subquery:
```sql
user_id = auth.uid()
OR user_id IN (
  SELECT CASE WHEN user_id_1 = auth.uid() THEN user_id_2 ELSE user_id_1 END
  FROM friendships
  WHERE user_id_1 = auth.uid() OR user_id_2 = auth.uid()
)
```

### 5.3 Friend Requests

| Operation | Policy |
|-----------|--------|
| INSERT | `sender_id = auth.uid()` |
| SELECT | `sender_id = auth.uid() OR receiver_id = auth.uid()` |
| UPDATE | `receiver_id = auth.uid()` (to accept/decline) |
| DELETE | `sender_id = auth.uid()` (to cancel) |

### 5.4 Friendships

| Operation | Policy |
|-----------|--------|
| SELECT | `auth.uid() IN (user_id_1, user_id_2)` |
| INSERT | `auth.uid() IN (user_id_1, user_id_2)` |

### 5.5 Event Attendees

| Operation | Policy |
|-----------|--------|
| SELECT | Own attendance, OR own events, OR friends' events |
| INSERT | Self-attendance, OR owner of the event |

---

## 6. Auth Flow

```
[User opens app]
       │
       ▼
┌──────────────────────┐
│  Check session       │──── Supabase Auth `getSession()`
│  (localStorage JWT)  │
└──────────┬───────────┘
           │
    ┌──────┴──────┐
    ▼              ▼
[Logged in]    [Not logged in]
    │              │
    │              ▼
    │     ┌──────────────────┐
    │     │  Show Auth UI    │
    │     │  (Sign Up / In)  │
    │     └────────┬─────────┘
    │              │
    │              ▼
    │     ┌──────────────────┐
    │     │  Supabase Auth   │
    │     │  signUp / signIn │
    │     └────────┬─────────┘
    │              │
    │              ▼
    │     ┌──────────────────┐
    │     │ Auto-create      │
    │     │ profile row      │
    │     │ (DB trigger)     │
    │     └────────┬─────────┘
    │              │
    └──────┬───────┘
           ▼
┌──────────────────────┐
│  Load app:           │
│  - Fetch own events  │
│  - Fetch friends     │
│  - Fetch requests    │
│  - Subscribe to      │
│    real-time changes │
└──────────────────────┘
```

### 6.1 Session Persistence

Supabase Auth stores the JWT in localStorage automatically. On page reload, `getSession()` restores the session without requiring a new login.

### 6.2 Profile Auto-Creation

A PostgreSQL trigger or the application code creates a `profiles` row when a new user signs up. We use application-level creation (in `app.js`) for simplicity: after `signUp()` succeeds, insert into `profiles` with the new user's ID.

---

## 7. Data Flow

### 7.1 Loading the App

```javascript
// On init()
const session = await supabase.auth.getSession()
if (!session) { showAuthUI(); return }

// Load user data
const profile = await supabase.from('profiles').select('*').eq('id', user.id).single()
const events = await supabase.from('events').select('*')
const friends = await supabase.from('friendships').select('*').or('user_id_1.eq.user.id,user_id_2.eq.user.id')
const requests = await supabase.from('friend_requests').select('*').or('sender_id.eq.user.id,receiver_id.eq.user.id')

// Subscribe to real-time changes on friends' events
supabase.channel('friends-events')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, handleChange)
  .subscribe()
```

### 7.2 Creating an Event

```javascript
// User clicks "Save" in booking modal
const { data, error } = await supabase.from('events').insert({
  user_id: user.id,
  title: 'Study Session',
  day_index: 0,
  start_time: '10:00',
  end_time: '11:00',
  category: 'study',
  event_type: 'personal'
})

// If event_type is 'group', also insert into event_attendees
if (event_type === 'group') {
  await supabase.from('event_attendees').insert(
    invitees.map(friendId => ({ event_id: data.id, user_id: friendId }))
  )
}
```

### 7.3 Sending a Friend Request

```javascript
await supabase.from('friend_requests').insert({
  sender_id: currentUser.id,
  receiver_id: targetUser.id,
  status: 'pending'
})
```

### 7.4 Accepting a Friend Request

```javascript
// This is wrapped in a transaction-like sequence:
// 1. Update request status
// 2. Create friendship row (both directions)
// 3. Notify both users via real-time

await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId)

// Insert friendship with user_id_1 < user_id_2 constraint
const id1 = Math.min(currentUser.id, sender.id)
const id2 = Math.max(currentUser.id, sender.id)
await supabase.from('friendships').insert({ user_id_1: id1, user_id_2: id2 })
```

---

## 8. Real-Time Subscriptions

Supabase Realtime uses WebSocket connections to subscribe to database changes.

### 8.1 Subscription Plan

| Channel | Filter | Purpose |
|---------|--------|---------|
| `events` | All changes to `events` table | Friends' calendar changes appear live |
| `friend_requests` | Filtered by `receiver_id = currentUser` | Instant notification of new requests |
| `profiles` | All changes | Avatar/name updates reflect immediately |

### 8.2 Implementation

```javascript
const eventsChannel = supabase.channel('events')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'events' },
    (payload) => {
      // Re-fetch events or apply optimistic update
      renderCalendar()
    }
  )
  .subscribe()
```

### 8.3 Optimistic Updates

For better UX, the app applies changes locally first (optimistic), then confirms with the server:

1. On event create: insert into state.events immediately, render, send to Supabase
2. On Supabase error: roll back, show toast

---

## 9. Frontend Architecture

### 9.1 Module Structure

```
app.js (main application logic — 2,500+ lines)
├── State Management (Supabase-aware)
├── Rendering Engine
│   ├── renderCalendar()
│   ├── renderFriendsSidebar()
│   ├── renderFriendsHub()
│   ├── renderNotifications()
│   └── renderSharedEventsWidget()
├── Modal Controllers
├── Event Handlers
└── Initialisation

supabase.js (new)
├── Client initialisation (anon key)
├── Auth helpers (login, signup, logout, session)
├── Data helpers (events CRUD, friend requests, friendships)
└── Realtime subscription setup
```

### 9.2 State Migration (localStorage → Supabase)

| Concern | Before | After |
|---------|--------|-------|
| Events | `state.events` from localStorage | `state.events` fetched from Supabase, cached in memory |
| Friends | `state.friends` from localStorage | `state.friends` built from friendships + profiles query |
| Friend Requests | `state.sentRequests` / `state.incomingRequests` from localStorage | Queried from `friend_requests` table |
| Notifications | localStorage | Still localStorage (user-local, no sharing needed) |
| Wallpaper | localStorage | Still localStorage (user-local preference) |
| Session | None | Supabase Auth JWT in localStorage |

### 9.3 Loading States

The app uses a simple loading overlay while initial data fetches complete:

```html
<div id="loadingScreen">Loading ArcTime...</div>
```

Hidden once all initial queries resolve.

---

## 10. Deployment Architecture

```
┌──────────────────────────────────────────────────┐
│                  GitHub                           │
│  ┌──────────────────────────────────────────┐     │
│  │  Repository: Arc-y7b/arctime             │     │
│  │                                           │     │
│  │  main branch                             │     │
│  │  ├── index.html                          │     │
│  │  ├── style.css                           │     │
│  │  ├── app.js                              │     │
│  │  ├── supabase.js                         │     │
│  │  ├── PRD.md                              │     │
│  │  ├── README.md                           │     │
│  │  ├── migration.sql                       │     │
│  │  └── docs/architecture.md                │     │
│  └─────────────────────┬────────────────────┘     │
│                        │                          │
│  ┌─────────────────────▼────────────────────┐     │
│  │  GitHub Pages                            │     │
│  │  https://arc-y7b.github.io/arctime/      │     │
│  │  (serves static files from main branch)  │     │
│  └──────────────────────────────────────────┘     │
└──────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────┐
│               Supabase Cloud                      │
│                                                   │
│  Project: bszdmkydzzujvctgihqk                   │
│  URL: https://bszdmkydzzujvctgihqk.supabase.co   │
│                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Auth       │  │ PostgreSQL │  │ Realtime   │  │
│  │ (GoTrue)   │  │ Database   │  │ WebSocket  │  │
│  └────────────┘  └────────────┘  └────────────┘  │
└──────────────────────────────────────────────────┘
```

### 10.1 Environment Variables

| Variable | Where Used | Purpose |
|----------|-----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `supabase.js` (browser) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `supabase.js` (browser) | Anon key for client-side queries |
| `SUPABASE_SECRET_KEY` | Server-side only (not in browser) | Service role key for admin operations |

---

## 11. Migration Plan

### Phase 1: Database Setup
- [x] Design schema
- [x] Create migration SQL
- [ ] Run migration in Supabase SQL Editor
- [ ] Enable real-time on tables

### Phase 2: Backend Integration
- [ ] Add `supabase.js` client initialisation
- [ ] Implement auth UI (sign up, login, logout)
- [ ] Replace event CRUD (localStorage → Supabase)
- [ ] Replace friend request flow
- [ ] Wire up friendships
- [ ] Add real-time subscriptions

### Phase 3: Cleanup & Polish
- [ ] Remove localStorage event/friend code
- [ ] Loading states during data fetch
- [ ] Error handling for offline/Supabase-down
- [ ] Test full flow: sign up → add friend → share calendar → real-time update

---

## 12. Security Considerations

- **Never expose the service_role key** in client-side code — it has full database access
- All browser queries use the **anon key** with RLS enforcement
- Friend request acceptance validates the friendship constraint (`user_id_1 < user_id_2`)
- Event visibility is restricted by RLS to owners and friends
- Supabase Auth handles password hashing, session tokens, and CSRF protection
- Wallpaper/notification data stays in localStorage (user-local, not shared)

---

## 13. Future Considerations

- **Pagination**: As user bases grow, events queries need pagination (Supabase supports `range` headers)
- **Soft deletes**: Instead of DELETE, add `deleted_at` to events for undo support
- **Rate limiting**: Supabase has built-in rate limiting on the API Gateway
- **Presence**: Supabase Realtime supports presence channels for "who's online"
- **Storage API**: For avatar uploads instead of data URLs (Supabase Storage has a free tier)
