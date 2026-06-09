# ArcTime — Sync Calendars, Make Memories Together

**ArcTime** is a premium timezone-aware calendar overlay web application designed to help friends coordinate and sync schedules, visualize availability overlap, and plan group hangouts. 

Originally built as a pure client-side application using local storage, ArcTime has been upgraded to a fully integrated serverless architecture powered by **Supabase** for secure authentication, database persistence, realtime updates, and social connections.

👉 **[Live Demo](https://arc-y7b.github.io/arctime/)**

---

## Architecture & Tech Stack

ArcTime runs on a lightweight, high-performance tech stack:

* **Frontend**: Vanilla HTML5, CSS3 (CSS Grid, Custom variables, Glassmorphism, animations), and modular JavaScript (ES Modules).
* **Database & Auth**: Supabase (PostgreSQL, GoTrue, PostgREST).
* **Realtime**: Supabase Realtime Channels (PostgreSQL changes listener) for instant scheduling updates.
* **Icons**: Lucide Icons CDN.

```
┌──────────────────────────────────────────────────────────────────┐
│                           index.html                             │
│         (Weekly Calendar Grid, Modals, Auth Forms, UI)           │
├───────────────────────┬──────────────────────┬───────────────────┤
│       style.css       │     supabase.js      │     mobile.js     │
│  (Glassmorphic styles,│ (Supabase SDK Client,│(Viewport Boundary,│
│   variables, theme)   │  auth API & data)    │ mobile presenters)│
├───────────────────────┴──────────────────────┴───────────────────┤
│                             app.js                               │
│     (UI rendering, Timezone engine, Scheduler, Event handlers)    │
└──────────────────────────────────────────────────────────────────┘
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

### 5. Mobile Portrait Optimization (< 768px)
* **Single-Day Timeline Carousel**: Displays one active day at a time in portrait viewports to optimize space.
* **Swipe Gesture Navigation**: Smooth horizontal swipe gestures on the calendar columns switch the selected day forward/backward.
* **Responsive Bottom Tab Bar**: Replaces desktop sidebars/headers with active view switching: **Calendar**, **Friends**, **Suggestions**, and **Settings**.
* **Transitioning Bottom Sheets**: Desktop settings drawers and booking modals transform into touch-friendly slide-up bottom sheets.
* **Auto-Saving Settings**: Saving or canceling settings automatically redirects the user back to the Calendar view.
* **Cache-Busting Integration**: Complete version-query parameters (`?v=2.0`) protect users from old local caching.

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

### 3. Running Unit Tests
ArcTime features unit testing for its mobile presentation layers and gesture modules using Node's native test runner:

```bash
# Run all mobile presenter and gesture spec tests
node test/mobile.test.js && node test/presenter.test.js
```

---

## Troubleshooting CORS / Network Errors
If you run into `NetworkError` or `Cross-Origin Request Blocked` when calling Supabase endpoints, check the following:
1. **Host URL Typo**: Verify that `SUPABASE_URL` in [supabase.js](file:///home/aarav/Projects/arctime/supabase.js) ends with `.supabase.co` (not `.sb.co`).
2. **CORS Settings**: In the Supabase Dashboard, navigate to **Settings -> API** and verify that Allowed Web Origins includes your local addresses (`http://localhost:8000`, `http://127.0.0.1:8000`).

---

## Appendix: Feature Catalog & User Guide

Here is a breakdown of all frontend features in ArcTime, how they behave, and how they map to your Supabase datastore:

### 1. User Authentication & Session Persistence
* **What it does**: Users register with email, password, username, and display name, and sign in. JWT tokens are automatically cached in `localStorage` by Supabase so sessions persist across refreshes.
* **Database Mapping**: Auth credentials live in the protected `auth.users` table. The trigger function `on_auth_user_created` automatically populates the `public.profiles` table with matching user IDs and metadata.

### 2. Month View Toggle (Status: Future Consideration)
* **What it does**: You will notice the **Month** view button is currently disabled and shows a *"Month view coming soon"* tooltip on hover. 
* **Database Mapping**: The month view requires client-side paginated queries to handle larger sets of events. This is listed under **Future Considerations** (Section 13 of [architecture.md](file:///home/aarav/Projects/arctime/docs/architecture.md)) and is not yet implemented. The calendar currently displays in a Weekly grid (Monday–Sunday).

### 3. Availability status switcher ("Free / Busy")
* **What it does**: A quick toggle in the sidebar to simulate or display your instant availability.
  * **Selecting Busy**: Toggles `state.userAvailability` to `'busy'` and inserts a temporary, local-only calendar block (`u-busy-temp` titled *"User Blocked Time"* on Monday from 11:00 to 13:00) onto your weekly view. This allows you to quickly preview overlays and smart suggestions without writing to the database.
  * **Selecting Free**: Resets status to `'free'` and clears the temporary block.
* **Database Mapping**: Local-only client state. It does not write to the `events` table in Supabase. To create a permanent busy block, use the **Block Busy Slot** button.

### 4. Week Switcher & Timezone Converter
* **What it does**: Navigate weeks with arrows, reset with "Today". Toggle timezones between BST (GMT+1) and GMT.
* **Database Mapping**: All calendar event start and end times are normalized and saved to the Supabase `events` table in **GMT**. Toggling the timezone switches display times in-place on the fly, ensuring cross-timezone groups stay perfectly synchronized.

### 5. Quick Block ("Block Busy Slot") & Custom Booking Form
* **What it does**: Clicking "Block Busy Slot" or clicking any empty cell on the grid opens the Booking Modal. Users can create personal events (busy blocks) or group activities (inviting attendees).
* **Database Mapping**: Writing or updating events posts directly to the `events` table. If the event type is set to `group` and attendees are selected, rows are added to the `event_attendees` table. RLS policies ensure you can only edit or delete events that you own.

### 6. Social Overlay (Friends Hub)
* **What it does**: Search for users by username, send friend requests, and accept/decline incoming requests. Toggling friend checkboxes in the sidebar overlays their calendars on your weekly grid.
* **Database Mapping**: Managed via `friend_requests` and `friendships` tables. Enabling a friend's overlay triggers a SELECT query on the `events` table (which is allowed by RLS because they are in your `friendships` table).

### 7. Copy & Paste Slots
* **What it does**: Clicking a card lets you "Copy" it. A floating clipboard banner appears at the bottom of the screen. Clicking another day or time on the grid lets you "Paste" the slot.
* **Database Mapping**: The copied event metadata is stored in `localStorage` (`arctime_copied_event`). Pasting calculates the new time-offset in GMT and inserts a new event row into the `events` table.

### 8. Smart Slot Finder
* **What it does**: Select a duration (e.g., 1 hour) and click **Find Common Slots**. An interval-arithmetic scheduler computes all hours of the week where all checked friends and the host are free.
* **Database Mapping**: Computes availability in-memory on the client by analyzing the union of all events currently fetched for you and your selected friends.

### 9. Real-time Database Syncing
* **What it does**: If a friend blocks a slot, sends you a request, or updates their schedule, the changes are propagated to your screen instantly without a page refresh.
* **Database Mapping**: Secured by Supabase Realtime Channels (PostgreSQL changes replication). The browser client subscribes to WebSocket update notifications, which automatically trigger `renderCalendar()` and `updateSmartSuggestions()`.

