# ArcTime — Data Models

**Last updated:** June 2026

---

## 1. Entity Relationship Diagram

```
┌──────────────────┐
│   auth.users     │  (managed by Supabase)
│  ─────────────── │
│  id (UUID)      │
│  email          │
│  created_at      │
└────────┬─────────┘
         │ 1:1
         ▼
┌──────────────────────┐
│      profiles        │
│  ─────────────────── │
│  id (UUID) ──── PK  │──┐
│  username (TEXT, UNIQUE)│ │
│  display_name (TEXT) │ │
│  avatar_url (TEXT)   │ │
│  timezone (TEXT)     │ │
│  created_at          │ │
└──────────────────────┘ │
         │               │
         │ 1:N           │ 1:N (as sender)
         ▼               ▼
┌──────────────────────┐  ┌───────────────────────────┐
│       events         │  │     friend_requests        │
│  ─────────────────── │  │  ─────────────────────────  │
│  id (UUID) ──── PK  │  │  id (UUID) ──── PK         │
│  user_id (UUID) FK ─┼──┼── sender_id (UUID) FK      │
│  title (TEXT)       │  │  receiver_id (UUID) FK ────┼── (as receiver)
│  day_index (SMALLINT)│  │  status (TEXT)             │
│  start_time (TEXT)  │  │  created_at                 │
│  end_time (TEXT)    │  │  UNIQUE(sender, receiver)   │
│  category (TEXT)    │  └───────────────────────────┘
│  notes (TEXT)       │
│  event_type (TEXT)  │
│  created_at         │
└────────┬────────────┘
         │ 1:N
         ▼
┌───────────────────────────┐
│     event_attendees       │      ┌──────────────────────┐
│  ──────────────────────── │      │     friendships       │
│  event_id (UUID) FK ─────┼──┐   │  ──────────────────── │
│  user_id (UUID) FK ──────┼──┼───┼── user_id_1 (UUID)   │
│  PRIMARY KEY (event,user)│  │   │  user_id_2 (UUID)     │
└──────────────────────────┘  │   │  created_at           │
                              │   │  PK (id1, id2)       │
                              │   │  CHECK (id1 < id2)   │
                              │   └──────────────────────┘
                              │
                              └── Auth users connect through friendships
                                  (and through event_attendees for shared events)
```

---

## 2. Table: `profiles`

Extended user profile linked 1:1 with Supabase Auth.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK → auth.users(id) ON DELETE CASCADE | — | Same UUID as the Auth user |
| `username` | `text` | UNIQUE | — | Unique handle used for friend search (e.g. "aarav") |
| `display_name` | `text` | | — | Full name shown in the UI (e.g. "Aarav Patel") |
| `avatar_url` | `text` | | Screenshot default | Profile photo URL or data URL |
| `timezone` | `text` | | `'BST'` | Preferred timezone (BST or GMT) |
| `created_at` | `timestamptz` | | `now()` | Account creation timestamp |

**RLS:**
- SELECT: everyone (needed for friend search)
- INSERT: own row only (`auth.uid() = id`)
- UPDATE: own row only

---

## 3. Table: `events`

A calendar event — either a personal busy slot or a shared group activity.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Unique event identifier |
| `user_id` | `uuid` | FK → profiles(id) ON DELETE CASCADE, NOT NULL | — | Owner of this event |
| `title` | `text` | NOT NULL | — | Event name (e.g. "Study Session") |
| `day_index` | `smallint` | CHECK (0–6), NOT NULL | — | 0=Monday, 6=Sunday |
| `start_time` | `text` | NOT NULL | — | Start time in GMT, format `HH:MM` |
| `end_time` | `text` | NOT NULL | — | End time in GMT, format `HH:MM` |
| `category` | `text` | | `'hangout'` | One of: `study`, `hangout`, `dinner`, `sports`, `gaming` |
| `notes` | `text` | | `''` | Optional description, location, or link |
| `event_type` | `text` | CHECK ('personal', 'group') | `'personal'` | Personal busy slot or group activity |
| `created_at` | `timestamptz` | | `now()` | Creation timestamp |

**Indexes:** `events_user_id_idx` on `user_id` for fast friend-calendar queries.

**RLS:**
- SELECT: own events + friends' events (via friendships join)
- INSERT: own events only (`user_id = auth.uid()`)
- UPDATE: own events only
- DELETE: own events only

---

## 4. Table: `event_attendees`

Join table for group events — maps which users are attending a shared activity.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `event_id` | `uuid` | PK, FK → events(id) ON DELETE CASCADE | The group event |
| `user_id` | `uuid` | PK, FK → profiles(id) ON DELETE CASCADE | An attendee |

**RLS:**
- SELECT: self, own events, or friends' events
- INSERT: self, or event owner

---

## 5. Table: `friend_requests`

Tracks the lifecycle of a friend request between two users.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Unique request identifier |
| `sender_id` | `uuid` | FK → profiles(id) ON DELETE CASCADE, NOT NULL | — | User who sent the request |
| `receiver_id` | `uuid` | FK → profiles(id) ON DELETE CASCADE, NOT NULL | — | User who receives the request |
| `status` | `text` | CHECK ('pending', 'accepted', 'declined') | `'pending'` | Current state of the request |
| `created_at` | `timestamptz` | | `now()` | When the request was sent |

**Unique constraint:** `(sender_id, receiver_id)` — prevents duplicate requests.

**RLS:**
- INSERT: as sender only
- SELECT: as sender or receiver
- UPDATE: as receiver only (accept/decline)
- DELETE: as sender only (cancel)

---

## 6. Table: `friendships`

Bidirectional friendship link between two users. Each pair stored exactly once.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `user_id_1` | `uuid` | PK, FK → profiles(id) ON DELETE CASCADE | — | Lower UUID (enforced by CHECK) |
| `user_id_2` | `uuid` | PK, FK → profiles(id) ON DELETE CASCADE | — | Higher UUID |
| `created_at` | `timestamptz` | | `now()` | When the friendship was established |

**CHECK constraint:** `user_id_1 < user_id_2` ensures each unordered pair is stored once.

**RLS:**
- SELECT: if user is in either column
- INSERT: if user is in either column

---

## 7. State Shape (Frontend)

The following represents how data is structured in the JavaScript runtime after being fetched from Supabase:

```typescript
interface AppState {
  // Auth
  session: Session | null
  user: User | null
  profile: Profile | null

  // Calendar
  currentWeekStart: Date
  activeView: 'week' | 'month'
  timezone: 'BST' | 'GMT'
  durationMinutes: number
  highlightCommonFree: boolean
  copiedEvent: CopyPayload | null

  // Friends
  friends: Record<string, Friend>       // keyed by user_id
  selectedFriends: string[]              // array of user_ids to overlay
  friendRequests: {
    sent: FriendRequest[]
    incoming: FriendRequest[]
  }

  // Events (owned + friends')
  events: CalendarEvent[]

  // Notifications (local only)
  notifications: Notification[]
  unreadCount: number
}
```

### Type Definitions

```typescript
interface Profile {
  id: string
  username: string
  display_name: string
  avatar_url: string
  timezone: string
  created_at: string
}

interface CalendarEvent {
  id: string
  user_id: string
  title: string
  day_index: number       // 0=Mon, 6=Sun
  start_time: string       // "HH:MM" in GMT
  end_time: string         // "HH:MM" in GMT
  category: string
  notes: string
  event_type: 'personal' | 'group'
  created_at: string
  // Transient (computed at render time)
  attendees?: string[]     // user_ids for group events
  displayDayIndex?: number // after timezone conversion
  displayStartTime?: string
  displayEndTime?: string
}

interface Friend {
  id: string               // user_id
  username: string
  name: string
  display_name: string
  avatar: string
  color: string            // theme colour (local assignment)
  status: string
  statusType: 'free' | 'busy' | 'away'
  schedulePreset?: string  // for simulation
}

interface FriendRequest {
  id: string
  sender_id: string
  receiver_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  // Denormalised (joined from profiles)
  sender_name?: string
  sender_username?: string
  receiver_name?: string
  receiver_username?: string
}

interface Notification {
  id: string
  title: string
  message: string
  type: 'success' | 'warning' | 'away' | 'info'
  timestamp: string
}

interface CopyPayload {
  title: string
  startTime: string
  endTime: string
  category: string
  notes: string
}
```

---

## 8. LocalStorage Keys (Pre-Migration)

These keys are used by the current client-only version and will be replaced by Supabase queries:

| Key | Replacement |
|-----|-------------|
| `arctime_events` | `events` table |
| `arctime_username` | `profiles.display_name` |
| `arctime_username_handle` | `profiles.username` |
| `arctime_avatar` | `profiles.avatar_url` |
| `arctime_privacy_level` | `profiles.privacy_level` (future) |
| `arctime_sent_requests` | `friend_requests` WHERE sender_id = user AND status = 'pending' |
| `arctime_incoming_requests` | `friend_requests` WHERE receiver_id = user AND status = 'pending' |
| `arctime_notifications` | Still localStorage (local-only) |
| `arctime_copied_event` | Still localStorage (session-local) |
| `arctime_wallpaper_*` | Still localStorage (local preference) |
