# VANTA

A premium, privacy-first desktop client for browsing and archiving OnlyFans content. Built with Tauri 2 (Rust core + React/TypeScript frontend).

![VANTA](https://img.shields.io/badge/VANTA-1.1.0-8C93C9?style=for-the-badge)
![Tauri](https://img.shields.io/badge/Tauri-2.0-orange?style=flat-square)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square)
![Rust](https://img.shields.io/badge/Rust-stable-red?style=flat-square)

## Screenshots

### Home
![Home](screenshots/Home.png)

### Library
![Library](screenshots/Library.png)

### Gallery
![Gallery](screenshots/Gallery.png)

### Insights
![Insights](screenshots/Insights.png)

## Features

### Download & Sync
- **Full archive downloads** — Posts, archived posts, stories, highlights, and DMs from any creator
- **Batch "Sync All"** — Download everything from all your subscriptions in one click
- **Background auto-sync** — Periodically checks for and downloads new content automatically
- **Incremental sync** — Tracks last-seen post IDs per creator to avoid re-fetching old content
- **Download options** — Skip stories/messages, photos-only, videos-only, paid-only, free-only, date-range filtering
- **Bandwidth limiting** — Cap download speed to avoid saturating your connection
- **Per-job pause/resume** — Pause individual downloads without killing them
- **Retry with backoff** — Failed downloads automatically retry with exponential backoff
- **Download logging** — Every download is logged to SQLite for auditability

### Gallery & Library
- **Virtualized grid** — Handles millions of items smoothly with IntersectionObserver lazy-loading
- **Smart filters** — By type (photo/video/audio), paid/free, favorites, untagged, date range, rating
- **Collections** — Organize media into named collections
- **Tags** — Tag any item, filter by tags with clickable chips
- **1-5 star ratings** — Rate items, sort and filter by rating
- **Duplicate finder** — SHA-1 hash-based exact duplicate detection with one-click cleanup
- **Right-click context menu** — Open, reveal, favorite, rate, tag, copy path, delete
- **Grid density** — Small/Medium/Large tile sizes
- **Group by creator** — Organize the grid by creator

### Media Viewing
- **Image lightbox** — Zoom/pan, rotation, keyboard navigation, filmstrip
- **Custom video player** — Scrub bar, volume, playback speed (0.5x-2x), frame capture
- **Audio player** — Custom UI with seek bar and volume for audio content
- **Slideshow mode** — Auto-advance through items
- **Keyboard shortcuts** — F (favorite), R (reveal), S (slideshow), arrows (navigate), Space (play/pause)

### Privacy & Security
- **PIN lock** — PBKDF2-SHA256 hashed PIN (100k iterations), backward-compatible with legacy SHA-1
- **Duress PIN** — Secondary PIN that unlocks to an empty library
- **Panic hotkey** — Global hotkey to instantly hide and lock the app
- **Auto-lock** — Lock on window blur or after configurable inactivity timeout
- **Stealth mode** — Disguise window title in taskbar (e.g. "Files")
- **Blur thumbnails** — Blur gallery thumbnails until hover
- **Credential blur** — Credentials are blurred by default in Settings
- **Clear on panic** — Optionally clear clipboard and activity log on panic

### Insights & Analytics
- **Storage breakdown** — Photos, videos, audio, and other by size
- **Per-creator stats** — Storage used and item count per creator
- **Download history** — Timeline of recent downloads with status
- **Paid content tracker** — Total archived paid content value
- **Content coverage** — Posts saved vs. total posts per creator
- **CSV export** — Export library metadata to CSV

### Platform
- **System tray** — Minimize to tray, right-click menu, left-click toggle
- **Window state persistence** — Remembers position, size, and maximized state
- **Close-to-tray** — Keep running in background when closed
- **Command palette** — Ctrl+K to quick-switch views and run commands

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Web UI (Vite + React 19 + TypeScript)                        │
│  • Screens: Home, Library, Gallery, Downloads, Insights,     │
│    Settings                                                  │
│  • Zustand state management                                  │
│  • Framer Motion animations                                  │
│  • CSS custom properties for theming                         │
│  • Virtualized grid (@tanstack/react-virtual)                │
└───────────▲───────────────────────────────────┬──────────────┘
            │ invoke(command)                    │ listen(event)
┌───────────┴───────────────────────────────────▼──────────────┐
│ Tauri 2 Rust core                                            │
│  • api.rs       — OF API client with request signing         │
│  • commands.rs  — Tauri command handlers                     │
│  • downloads.rs — Concurrent download engine                 │
│  • library.rs   — SQLite media index (favorites/tags/ratings)│
│  • config.rs    — JSON config persistence                    │
│  • downloader.rs— Download list builder                      │
└────────────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 22+
- [Rust](https://rustup.rs/) (stable)
- Windows 10/11 (WebView2 runtime is pre-installed on Win10/11)

### Development
```bash
npm install
npm run tauri dev
```

### Production Build
```bash
npm run tauri build
```
This produces a Windows installer and standalone `.exe` in `src-tauri/target/release/`.

## Themes

VANTA ships with three built-in themes, plus accent color customization:
- **Graphite** (default) — Cool monochrome dark
- **Bone** — Warm light/paper
- **Clay** — Warm dark/earthy

All themes persist across restarts and can be combined with any accent color.

## Privacy

VANTA is designed with privacy as a first-class concern:
- All data is stored locally — nothing is sent to any server except the OnlyFans API
- Credentials are stored in a local config file, never transmitted except to OnlyFans
- The SQLite library database contains only file paths, favorites, tags, ratings, and sync metadata — no media content
- Downloaded files are stored in their original format on your local filesystem
- No telemetry, analytics, or tracking of any kind

## License

Apache-2.0 — see [LICENSE](LICENSE).