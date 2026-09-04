# Remon Download — Product Requirements

## Product
Remon Download is a desktop download manager for YouTube videos, Shorts, playlists, playlist videos, and channels. The UI is a React + Vite app (HashRouter) with Electron for native downloads. There is no login, accounts, or authentication.

## Users
Single local user on Windows. No sign-in.

## Core pages
1. Dashboard `/#/` — Quick Add: paste YouTube URL, analyze metadata, choose quality/format, add to queue.
2. Queue `/#/queue` — list downloads, pause/resume/cancel/retry, reorder, concurrency and speed limit.
3. History `/#/history` — completed/failed/canceled items, retry, favorite, delete.
4. Favorites `/#/favorites` — saved items, download again, remove.
5. Scheduler `/#/scheduler` — schedule URL + date/time + repeat, cancel scheduled jobs.
6. Settings `/#/settings` — language (EN/AR), theme, download folder, quality, formats, filename template, reset.
7. About `/#/about` — app name, version, developer, contact.

## Acceptance criteria
- Sidebar navigation reaches every page without authentication.
- Invalid YouTube URLs show validation errors and are not queued.
- Valid video URLs can be analyzed and added to the queue (mock or native depending on runtime).
- Queue shows empty state when there are no items.
- Settings language/theme changes are visible; reset restores defaults.
- About page shows application name and version.
- Channel-wide download is not supported; UI shows a notice.
- Native folder picker may be unavailable in browser-only mode.

## Out of scope for browser E2E
- System tray
- Real yt-dlp/ffmpeg when Electron APIs are missing
- Cloud sync, payments, multi-user auth
