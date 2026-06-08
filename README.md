# ArcTime — Sync Calendars, Make Memories Together

**ArcTime** is a premium timezone-aware calendar overlay web application designed to help friends coordinate and sync schedules, visualize availability overlap, and plan group hangouts. 

Originally built as a pure client-side application using local storage, ArcTime has been upgraded to a fully integrated serverless architecture powered by **Supabase** for secure authentication, database persistence, realtime updates, and social connections.

👉 **[Live Demo](https://arc-y7b.github.io/arctime/)**

---

## Architecture & Tech Stack

ArcTime runs on a lightweight, high-performance tech stack:

* **Frontend**: Vanilla HTML5, CSS3 (CSS Grid, Custom variables, Glassmorphism, animations), and modular JavaScript.
* **Database & Auth**: Supabase (PostgreSQL, GoTrue, PostgREST).
* **Realtime**: Supabase Realtime Channels (PostgreSQL changes listener) for instant scheduling updates.
* **Icons**: Lucide Icons CDN.

```
┌────────────────────────────────────────────────────────┐
│                      index.html                        │
│     (Weekly Calendar Grid, Modals, Auth Forms, UI)     │
├──────────────────────────┬─────────────────────────────┤
│        style.css         │         supabase.js         │
│   (Glassmorphic styles,  │   (Supabase SDK Client,     │
│    variables, theme)     │    auth API & data helpers) │
├──────────────────────────┴─────────────────────────────┤
│                         app.js                         │
│   (UI rendering, Timezone engine, Scheduler, Event handlers) │
└────────────────────────────────────────────────────────┘
```

---

## Database Schema & Security (RLS)

ArcTime uses PostgreSQL database tables with strict Row-Level Security (RLS) policies to protect user privacy. The schema is defined in [migration.sql](file:///home/aarav/Projects/arctime/migration.sql):

### 1. Database Tables
* **`profiles`**: Stores user display names, usernames, avatars, and timezones. Kept in sync with `auth.users` via triggers.
* **`events`**: Calendar blocks. Can be `personal` (busy slots) or `group` (shared events).
* **`friend_requests`**: Tracks invitation status (`pending`, `accepted`, `declined`) between users.
* **`friendships`**: Stores accepted social connections (always ordered as `user_id_1 < user_id_2` to avoid duplicate rows).
* **`event_attendees`**: Maps users to group events.

### 2. Row-Level Security (RLS) Policies
* **Profiles**: Anyone can query profiles to search for friends, but users can only modify their own profile.
* **Events**: Users can only see events belonging to themselves or their accepted friends. Writing, updating, and deleting events is restricted solely to the owner.
* **Friendships & Requests**: Users can only view or manage relationships where they are either the sender or receiver.

---

## Key Features

### 1. Weekly Grid & Timezones
* Dynamic weekly schedule supporting BST (GMT+1) and GMT.
* Real-time in-place conversion when toggling between timezones.
* Today header with highlight glow.

### 2. Authentication & Profile Customization
* Secure login, registration, and logout via Supabase.
* Custom user profiles with avatars (includes an interactive circular crop tool) and display names.
* Customizable wallpaper with sliders for opacity and blur.

### 3. Social Sync & Real-time Sharing
* **Friends Sidebar**: Search for friends, send requests, and manage status (Free / Away / Busy).
* **Toggle Overlays**: Turn on/off friends' calendars to view their schedules overlaid on your own calendar grid in real-time.
* **Smart Slot Finder**: Uses interval-arithmetic algorithms to automatically identify overlapping free blocks of time across all selected friends.
* **Real-time Synchronization**: Direct connection to Postgres changes triggers UI refreshes the instant a friend adds, edits, or deletes a busy slot.

### 4. Advanced Event Scheduling
* Click empty slots to trigger the Booking Form.
* Copy & Paste events across days with a floating bottom clipboard banner.
* Edit existing event details or delete them through custom UI modals.

---

## Setup & Local Development

### 1. Environment Configuration
Create a `.env` file in the root of the project to store your environment keys (never committed to version control):

```env
GITHUB_PAT=your_github_token_here
SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
SUPABASE_SECRET_KEY=your_supabase_service_role_key
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
```

In [supabase.js](file:///home/aarav/Projects/arctime/supabase.js), initialize the client with your Supabase URL and Anon Key:

```javascript
const SUPABASE_URL = 'https://<your-project-id>.supabase.co';
const SUPABASE_ANON_KEY = '<your-anon-key>';
```

### 2. Local Server
Run a local web server from the project directory:

```bash
# Using Python
python3 -m http.server 8000

# Or using Node.js/npm
npx serve .
```

Open `http://localhost:8000` in your web browser.

---

## Troubleshooting CORS / Network Errors
If you run into `NetworkError` or `Cross-Origin Request Blocked` when calling Supabase endpoints, check the following:
1. **Host URL Typo**: Verify that `SUPABASE_URL` in [supabase.js](file:///home/aarav/Projects/arctime/supabase.js) ends with `.supabase.co` (not `.sb.co`).
2. **CORS Settings**: In the Supabase Dashboard, navigate to **Settings -> API** and verify that Allowed Web Origins includes your local addresses (`http://localhost:8000`, `http://127.0.0.1:8000`).
