# ArcTime — Sync Calendars, Make Memories Together

**ArcTime** is a lightweight, browser-based calendar coordination app that helps friend groups find common free time slots and book shared activities. No accounts, no backend — everything runs client-side and persists in localStorage.

👉 **[Live Demo](https://arc-y7b.github.io/arctime/)**

---

## Features

- **Weekly Calendar Grid** — Scrollable 24-hour view (Mon–Sun) with glassmorphism dark theme
- **Friend Overlay** — Add friends with schedule presets; toggle their calendars on/off the grid
- **Smart Slot Finder** — Interval-arithmetic engine computes common free windows across all selected people
- **Common Free Highlights** — Visual overlays on the calendar showing shared availability
- **Event Management** — Create personal busy slots or group activities with categories, notes, and attendees
- **Copy / Paste** — Copy any event and paste it onto an empty slot
- **Timezone Support** — Switch between BST and GMT; all times convert in-place
- **Friends Hub** — Send/accept/decline friend requests, manage status, edit availability
- **Privacy Controls** — Share full details, free/busy only, or hide your calendar entirely
- **Notification Center** — Activity feed with unread badge and clear-all
- **Custom Wallpaper** — Upload a background image with opacity and blur controls
- **Avatar Crop Tool** — Upload, drag, and zoom profile photos before saving

## How It Works

1. Open the app — your local calendar starts empty
2. **Add friends** via the Friends Hub — choose a name, colour, and schedule preset
3. **Toggle friends' calendars** in the sidebar to overlay their events on your grid
4. Click **Find Common Slots** to see shared free times
5. Click any slot or suggestion to **book a group activity**

All data is stored in your browser's localStorage — refresh or reopen and everything persists.

## Tech Stack

- Vanilla HTML / CSS / JavaScript (no frameworks)
- CSS Grid + custom properties for layout and theming
- localStorage for persistence
- GitHub Pages for hosting

## Local Development

```bash
# Clone the repo
git clone https://github.com/Arc-y7b/arctime.git

# Serve locally (any static file server works)
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

---

Built with ❤️ by [Arc](https://github.com/Arc-y7b)
