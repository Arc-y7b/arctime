# ArcTime — Product Requirements Document

**Status:** v1.0 — Complete  
**Platform:** Static web app (HTML/CSS/JS)  
**Hosting:** GitHub Pages  
**Last Updated:** June 2026

---

## 1. Overview

ArcTime is a calendar coordination app that helps groups of friends sync their schedules, visualise overlapping availability, and book shared activities — all in a premium dark-themed interface. No backend, no sign-up: everything runs in the browser with localStorage persistence.

### Problem

Groups of friends struggle to find mutually free time slots across different schedules, timezones, and availability preferences. Existing solutions require accounts, server setup, or are too heavy for quick coordination.

### Solution

A lightweight, single-page calendar app where each person manages their own calendar locally, overlays friends' schedules, and uses interval-arithmetic to instantly compute common free windows.

---

## 2. Target Users

- Friend groups wanting to plan hangouts, study sessions, or gaming nights
- Small teams coordinating part-time work / class schedules
- Anyone who prefers a no-account, browser-only scheduling tool

---

## 3. Functional Requirements

### 3.1 Calendar Core

| ID | Feature | Description |
|----|---------|-------------|
| F1 | Weekly Grid | Monday–Sunday columns, 24-hour vertical timeline (60px per hour), scrollable |
| F2 | Day Headers | Day name + date number, today highlighted with accent glow |
| F3 | Week Navigation | Previous / Next week buttons + "Today" reset |
| F4 | Timezone Toggle | Switch between BST (GMT+1) and GMT; all times convert in-place |
| F5 | Event Cards | Absolute-positioned cards with title, time, owner label; colour-coded by owner |
| F6 | Overlap Solver | Google Calendar-style column layout for overlapping events |

### 3.2 Event Management

| ID | Feature | Description |
|----|---------|-------------|
| F7 | Create Event | Click empty slot → Booking modal with title, date, time, duration, category, notes |
| F8 | Event Types | Personal (busy slot) or Group (shared activity with invited attendees) |
| F9 | Edit Event | Click existing event → Edit modal pre-filled with current data |
| F10 | Delete Event | Remove personal slot or cancel shared event |
| F11 | Copy/Paste | Copy event details → click empty slot → paste with time-offset |
| F12 | Quick Busy Block | "Block Busy Slot" sidebar button creates a 1-hour personal event at current time |

### 3.3 Friend System

| ID | Feature | Description |
|----|---------|-------------|
| F13 | Add Friend | Form with name, username handle, theme colour, schedule preset |
| F14 | Friend Request Flow | Send / receive / accept / decline / cancel requests with validation |
| F15 | Friends Directory | List of connected friends with avatar, status, online dot, remove button |
| F16 | Status Controls | Set friend status (Free / Away / Busy) and custom status text |
| F17 | Schedule Presets | Busy Day, Night Owl, Chilled Out, Erratic — auto-generate mock calendar events |
| F18 | Friends Hub Tab | Dedicated view with add-friend form, pending requests, directory |

### 3.4 Coordination Engine

| ID | Feature | Description |
|----|---------|-------------|
| F19 | Calendar Overlay | Toggle friends on/off in sidebar → their events appear on the grid |
| F20 | Common Free Slots | Interval-arithmetic scheduler finds windows where all selected friends + user are free |
| F21 | Highlight Overlaps | Visual overlay on calendar showing common free blocks with pulsing glow |
| F22 | Smart Slot Finder | Right panel: select duration → "Find Common Slots" → top 4 suggestions sorted by ideal time |
| F23 | Shared Plans Widget | Lists all shared group events with emoji categories and attendee dots |

### 3.5 User Profile & Settings

| ID | Feature | Description |
|----|---------|-------------|
| F24 | Profile Card | Avatar, display name, "You (Host)" tag, online dot |
| F25 | Settings Drawer | Edit display name, username handle, avatar (upload + crop tool) |
| F26 | Privacy Levels | Show Full Details / Free/Busy Only / Hide Calendar (Private) |
| F27 | Avatar Crop | Drag / zoom photo in circular crop workspace before saving |

### 3.6 UI / UX

| ID | Feature | Description |
|----|---------|-------------|
| F28 | Dark Theme | Premium dark palette with glassmorphism, gradients, accent glow |
| F29 | Custom Wallpaper | Upload background image with opacity & blur sliders (saved to localStorage) |
| F30 | Notification Center | Slide-out drawer with activity feed, unread badge, clear all |
| F31 | Toast Notifications | Slide-in feedback toasts (success / info) |
| F32 | Clipboard Banner | Floating bottom banner when an event is copied |
| F33 | Lucide Icons | Consistent icon set throughout the interface |

### 3.7 Data Persistence

| ID | Feature | Description |
|----|---------|-------------|
| F34 | localStorage | All state persisted: events, friends, requests, notifications, wallpaper, settings |
| F35 | Account Reset | Auto-clear on first load if legacy data detected |

---

## 4. Non-Functional Requirements

| ID | Requirement | Detail |
|----|-------------|--------|
| N1 | Zero Backend | Fully client-side; no servers, databases, or authentication |
| N2 | Offline Capable | Works without network after first load (all data in localStorage) |
| N3 | Performance | Calendar re-renders in <50ms; overlap solver O(n²) with n < 100 events |
| N4 | Mobile Responsive | Layout adapts via CSS grid (3-column → stacked on narrow screens) |
| N5 | Accessibility | Semantic HTML, keyboard-navigable controls, ARIA labels on interactive elements |
| N6 | Browser Storage Limits | Wallpaper capped at 3MB, avatars at 1.5MB to avoid quota issues |

---

## 5. Architecture

```
┌─────────────────────────────────────────────────┐
│                  index.html                      │
│  (semantic layout, modals, drawers, toasts)      │
├─────────────────────────────────────────────────┤
│                  style.css                       │
│  (CSS variables, glassmorphism, grid, animations)│
├─────────────────────────────────────────────────┤
│                  app.js                          │
│                                                   │
│  State Manager ── localStorage persistence        │
│       │                                           │
│  Rendering Engine                                 │
│       ├── renderCalendar()                        │
│       ├── renderFriendsSidebar()                  │
│       ├── renderFriendsHub()                      │
│       ├── renderNotificationsList()               │
│       └── renderSharedEventsWidget()              │
│       │                                           │
│  Interval Scheduler                               │
│       ├── subtractInterval()                      │
│       ├── intersectIntervalLists()                │
│       └── calculateCommonFreeSlots()              │
│       │                                           │
│  Overlap Solver                                   │
│       └── layoutDayEvents()                       │
│       │                                           │
│  Timezone Engine                                  │
│       ├── gmtToDisplay()                          │
│       └── displayToGmt()                          │
│                                                   │
│  Modal / Drawer Controllers                       │
│  Wallpaper Engine                                 │
│  Avatar Crop Tool                                 │
└─────────────────────────────────────────────────┘
```

### Data Model

```
State
├── currentWeekStart: Date
├── activeView: "week" | "month"
├── userAvailability: "free" | "busy"
├── highlightCommonFree: boolean
├── selectedFriends: string[]           // friend IDs
├── durationMinutes: number
├── timezone: "BST" | "GMT"
├── copiedEvent: CopyPayload | null
├── username: string
├── usernameHandle: string
├── avatar: string (data URL or URL)
├── privacyLevel: "full" | "freebusy" | "private"
├── friends: Record<id, Friend>
├── events: Event[]
├── sentRequests: FriendRequest[]
├── incomingRequests: FriendRequest[]
├── notifications: Notification[]
└── unreadCount: number
```

### Storage Keys

| Key | Content |
|-----|---------|
| `arctime_events` | JSON array of all calendar events |
| `arctime_username` | Display name |
| `arctime_username_handle` | Unique @handle |
| `arctime_avatar` | Avatar data URL |
| `arctime_privacy_level` | Privacy setting |
| `arctime_sent_requests` | Pending sent friend requests |
| `arctime_incoming_requests` | Pending incoming friend requests |
| `arctime_notifications` | Notification feed |
| `arctime_unread_count` | Unread badge count |
| `arctime_copied_event` | Copied slot payload |
| `arctime_wallpaper` | Wallpaper image data URL |
| `arctime_wallpaper_opacity` | Opacity slider value |
| `arctime_wallpaper_blur` | Blur slider value |

---

## 6. UI Component Tree

```
App Container (grid: sidebar | main | scheduler)
├── Sidebar
│   ├── Logo + Brand
│   ├── User Profile Card (click → Settings)
│   ├── Availability Status (Free / Busy)
│   ├── Block Busy Slot Button
│   ├── Friends' Calendars (toggle list)
│   ├── Settings Button
│   └── Simulation Info Card
├── Main Content
│   ├── Navbar
│   │   ├── Date Title + Week Nav
│   │   ├── View Tabs (Calendar / Friends Hub)
│   │   ├── Week/Month toggle
│   │   ├── Timezone Selector
│   │   ├── Highlight Overlaps Toggle
│   │   └── Notification Bell + Badge
│   ├── Calendar View
│   │   ├── Grid Header (day names + dates)
│   │   ├── Time Labels (24h column)
│   │   ├── Day Columns (event cards + common free overlays)
│   │   └── Event Action Modal (on click)
│   └── Friends Hub View
│       ├── Add Friend Form
│       ├── Pending Requests (incoming / sent)
│       └── Friends Directory (with status controls)
├── Scheduler Panel (right)
│   ├── Smart Slot Finder
│   │   ├── Duration Select
│   │   ├── Active Attendees Chips
│   │   ├── Find Common Slots Button
│   │   └── Suggestions List
│   └── Shared Plans Widget
├── Modals & Drawers
│   ├── Booking Modal (create/edit events)
│   ├── Add Friend Modal
│   ├── Crop Image Modal
│   ├── Event Action Modal
│   ├── Paste Action Modal
│   ├── Settings Drawer
│   └── Notification Drawer
└── Floating Elements
    ├── Toast Container
    └── Clipboard Banner
```

---

## 7. Future Considerations

- Backend sync (WebSocket / REST API for multi-device coordination)
- Real-time presence via WebRTC or WebSocket
- Month view rendering (Completed)
- Drag-and-drop event rescheduling
- Recurring events
- iCal / Google Calendar import/export
- Mobile app wrapper (PWA or React Native)
- Push notifications
