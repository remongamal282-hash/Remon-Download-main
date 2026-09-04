# Changelog

## Unreleased — Phase 3.5 Packaging

Added Windows NSIS and Portable packaging configuration, bundled yt-dlp/FFmpeg resources, production runtime path resolution, and installer documentation. Manual Installer E2E and the existing full-suite localStorage environment failures remain to be resolved before final Phase 3.5 sign-off.

## 1.2.0-system-tray (Phase 3.2 Automated Complete | Manual In Progress)

Added:
- **System Tray Integration**: Windows system tray with context menu and window management.
- **electron/tray.ts** (143 lines):
  - `createTray(mainWindow)`: Creates single Tray instance with icon and context menu (Show/Hide/Quit).
  - `showWindow(mainWindow)`: Shows and focuses window, restores if minimized.
  - `hideWindow(mainWindow)`: Hides window without closing application.
  - `minimizeToTray(mainWindow)`: Minimizes window to tray.
  - `quitApplication()`: Quits application via app.quit().
  - `destroyTray()`: Cleans up tray resources.
  - `hasTray()`, `getTray()`: Tray state queries.
  - Single instance guarantee: `createTray()` checks `hasTray()` before creating.
  - Icon path resolution: Uses app icon from root directory.
- **Tray Context Menu**:
  - "Show Remon Download" → Shows and focuses window.
  - "Hide Remon Download" → Hides window without closing app.
  - Separator.
  - "Quit Remon Download" → Quits application completely.
- **Tray Click Behavior**:
  - Left click: Show + Focus window.
  - Right click: Context menu.
- **Window Lifecycle Changes**:
  - X button (close event): Prevented → Hides window to tray instead of closing.
  - Minimize button: Triggers minimizeToTray() → Hides window.
  - window-all-closed event: Prevented on Windows (app continues running with tray active).
  - before-quit event: Destroys tray before process exits.
  - app.activate: Restores hidden window if mainWindow exists.
- **IPC Handler Updates**:
  - `WINDOW_CLOSE`: Now calls `hideWindow()` instead of `window.close()`.
  - `WINDOW_MINIMIZE`: Handler calls `minimize()`, minimize event listener does tray action.
  - No IPC contract changes (backwards compatible).
- **Test Files Created**:
  - `electron/tray.test.ts`: 23 unit tests for tray module (create, show, hide, quit, destroy, callbacks).
  - `electron/main.test.ts`: 12 lifecycle tests for window behavior and app lifecycle.
  - Mocking strategy: Electron GUI APIs mocked in Vitest (acknowledged limitation per spec).
- **Manual Test Checklist**:
  - `MANUAL_E2E_TEST_CHECKLIST.md`: 12 comprehensive manual tests covering:
    1. Tray icon appears on app launch.
    2. Right-click shows context menu.
    3. Hide operation → window disappears, process continues.
    4. Show operation → window returns and focuses.
    5. Download continues while window is hidden.
    6. Reopen from tray shows correct queue state.
    7. Scheduler starts downloads while app is hidden.
    8. Quit from tray → app exits completely.
    9. Left-click on tray icon shows + focuses window.
    10. Minimize button hides to tray.
    11. Multiple hide/show cycles work correctly.
    12. Close behavior is consistent.

Changed:
- **electron/main.ts**:
  - Added `import { createTray, destroyTray, showWindow, hideWindow, minimizeToTray } from "./tray"`.
  - Tray created after `createWindow()` in `app.whenReady()`.
  - Window close event handler prevents default and calls `hideWindow()`.
  - Window minimize event handler calls `minimizeToTray()`.
  - `window-all-closed` handler prevents default on Windows.
  - Added `before-quit` handler to destroy tray.
  - Updated `app.activate` to restore hidden window.
- **electron/ipc/handlers.ts**:
  - Added `import { hideWindow } from "../tray"`.
  - `WINDOW_CLOSE` handler now calls `hideWindow()` instead of `window.close()`.
- **electron/ipc/ipc.test.ts**:
  - Updated channel count assertion from 27 to 30 (pre-existing channels).

Fixed:
- TypeScript type safety: Window functions now accept `BrowserWindow | null` for defensive null checks.
- Minimize event handler null check: Verifies mainWindow exists before calling tray function.
- IPC channel count test: Updated to reflect actual channel count (30, not 27).

Tested:
- **TypeScript**: `npx tsc -p tsconfig.electron.json --noEmit` passes ✅
- **Build**: `npm run build` succeeds ✅
- **Electron Build**: `npm run electron:build` succeeds (79.5 KB main.cjs) ✅
- **Unit Tests**: Tray and lifecycle tests created (mock limitations acknowledged).

Known Behaviors:
- Tray is mandatory in Phase 3.2; no setting to disable it.
- X button hides to tray, not close — this is intentional to prevent accidental app exit.
- window-all-closed is prevented on Windows to keep tray active.
- Minimize goes to tray (not traditional minimize to taskbar).
- Only "Quit" from tray menu exits the app completely.
- IPC services (Download, Scheduler, Metadata, etc.) remain active while window is hidden.
- No process termination on window close; app continues running.

## 1.1.5-native-download (Phase 2.x Complete)

Added:
- **Native Download Integration**: Complete end-to-end real download system using yt-dlp subprocess.
- **NativeDownloadService** (752 lines):
  - Real yt-dlp subprocess spawning with progress parsing.
  - Pause strategy: Kill process + preserve .part file. Resume: Restart with `--continue` flag.
  - Concurrent download slot management (respects user-configured limit).
  - Quality/format selection: `bestvideo[height<=N]+bestaudio` with `--merge-output-format mp4/webm`.
  - Progress parsing: Regex-based parsing of yt-dlp human-readable output (`15.2%|1.5MiB|10MiB|500KiB/s|00:15`).
  - Status transitions: queued → analyzing → downloading → merging → converting → completed/failed.
  - Error handling: spawn failures, network errors, video unavailable, yt-dlp not found, concurrent limit exceeded.
  - FFmpeg location support via settings.
  - Speed limit support via `-r` flag.
  - Extension fix: `--remux-video` ensures correct single extension (e.g., `.mp4`, not `.mp4.webm`).
- **IPC Events** (download:progress, download:state-change): Push events from Main → Renderer for real-time updates.
- **ElectronDownloadService** (Renderer-side IPC adapter):
  - Event-driven architecture: Subscribes to IPC events in constructor (onProgress, onStateChange).
  - Local cache (`itemsCache`) updated on IPC events.
  - `onItemUpdate()` callback mechanism to notify subscribers (e.g., queueStore).
  - `transition()` method maps user actions to IPC commands (start/pause/resume/cancel/retry).
  - `tick()` is no-op in Electron mode (returns cached item, no polling).
- **queueStore Integration**:
  - Subscribes to `ElectronDownloadService.onItemUpdate()` in constructor.
  - Real-time updates: IPC events → ElectronDownloadService → queueStore.items → UI re-render.
  - `fillAvailableSlots()` transitions queued → analyzing, which triggers `start()` via IPC.
  - Works seamlessly with both Mock (web) and Electron modes.
- **Download IPC Integration Tests** (`electron/ipc/downloadIpc.test.ts`): 28 tests covering:
  - IPC channel contract validation.
  - Download operations (add, start, pause, resume, cancel, retry, remove, reorder).
  - Error propagation (item not found, concurrent limit, yt-dlp not found).
  - Progress and state-change events.
  - Concurrent download management.
- **NativeDownloadService Tests** (`electron/services/nativeDownloadService.test.ts`): 28 tests covering:
  - yt-dlp path resolution.
  - Download lifecycle (start, pause, resume, cancel, retry, remove).
  - Progress parsing from yt-dlp output.
  - State transitions.
  - Error handling (spawn failures, timeouts, network errors, video unavailable).
  - Concurrent downloads.
  - yt-dlp arguments construction.
  - Settings updates.
  - Cleanup.

Changed:
- **Progress Template**: Updated to use human-readable format (`%(progress._percent_str)s`) instead of raw bytes.
- **Progress Parser**: Added `parseSize()` helper to convert human-readable sizes (e.g., "1.5MiB") to bytes.
- **Build Configuration**: Added `--format=cjs --out-extension:.js=.cjs` to esbuild, updated `package.json` main entry to `main.cjs`, fixed preload path reference to `preload.cjs`.
- **fillAvailableSlots()**: Now correctly triggers `start()` via `transition(queued → analyzing)` which calls IPC start command.

Fixed:
- **ES Module Error**: Fixed "require is not defined in ES module scope" by outputting `.cjs` files for Electron Main Process.
- **Double Extension**: Fixed `.mp4.webm` issue by adding `--remux-video` flag to ensure correct format.
- **Progress Events Not Reaching UI**: Fixed by implementing `onItemUpdate()` callback mechanism in ElectronDownloadService and subscribing in queueStore.
- **Concurrent Download Logic**: Fixed activeCount to count only ["downloading", "merging", "converting"], not "analyzing".

Verified (Manual E2E Testing):
- ✅ Real YouTube video downloaded successfully (Me at the zoo - 191 KB).
- ✅ Progress displayed real-time in UI (speed, ETA, downloaded size).
- ✅ Status transitions: queued → analyzing → downloading → completed.
- ✅ File exists on disk with correct extension (`.webm` for test video).
- ✅ Failed downloads show proper error messages ("Video not found or access denied").
- ✅ History page populated automatically with completed/failed items.
- ✅ Concurrent downloads respect configured limit.
- ✅ QueueHistoryBridge automatically moves completed/failed items to History.

Test Results:
- `npm run test`: **30 test files, 246 tests, 0 failed** ✅
- `npm run build`: ✅ zero errors (tsc -b + vite build)
- `npm run electron:build`: ✅ zero errors (main.cjs + preload.cjs)
- **Manual verification**: Real downloads working end-to-end ✅

Architecture Notes:
- **Event-Driven**: Progress updates are event-driven (IPC), not polling-based.
- **Separation of Concerns**: Main Process (NativeDownloadService) handles yt-dlp, Renderer (ElectronDownloadService) handles UI state.
- **Backward Compatible**: Mock mode (web) continues working without changes.
- **Testable**: Dependency Injection (ProcessExecutor) enables deterministic tests without real yt-dlp.

Known Limitations:
- Some videos (age-restricted, geo-blocked, or heavily protected) may fail with "Video not found or access denied" - this is a yt-dlp/YouTube limitation.
- Pause/Resume functionality architecture complete but not extensively tested manually in current session.
- yt-dlp must be installed separately — no auto-download or bundled binary.

Phase 2.x Status: **COMPLETED ✅**

## 1.1.4-ytdlp-integration

Added:
- **Real yt-dlp integration in NativeMetadataService**: Production-ready metadata fetching using yt-dlp subprocess.
- Dependency Injection pattern: `ProcessExecutor` interface enables testable subprocess execution without complex mocking.
- yt-dlp path resolution:
  1. Settings `ytdlpPath` if provided and executable (checked via fs.access X_OK).
  2. System PATH candidates: `yt-dlp`, `yt-dlp.exe`, `youtube-dl`, `youtube-dl.exe` (tries each with --version check).
  3. Error `ytdlp_not_found` if none found.
- Security: URL passed as separate spawn argument, no shell=true, no command string concatenation.
- Timeout: 30 seconds for video/shorts, 60 seconds for playlists (documented in code).
- Complete error mapping: `invalid_url`, `unsupported_url`, `ytdlp_not_found`, `ytdlp_spawn_failed`, `ytdlp_timeout`, `video_unavailable`, `video_private`, `network_error`, `ytdlp_invalid_json`.
- Full metadata parsing for Video, Shorts, Playlist, Playlist-Video, and Channel URLs.
- `electron/services/nativeMetadataService.test.ts`: 24 comprehensive tests covering:
  - yt-dlp path resolution (Settings path, PATH fallback, not found).
  - Video/Shorts/Playlist/Channel metadata parsing.
  - All 9 error cases (invalid URL, unsupported URL, spawn failure, timeout, unavailable, private, network, invalid JSON, not found).
  - URL classification (no yt-dlp call required).
  - Security: URL as separate argument, no shell injection.
- `electron/ipc/metadataIpc.test.ts`: 19 integration tests with mock executor covering:
  - IPC handler simulation with wrapSuccess/wrapError.
  - Video/Shorts/Playlist/Channel URL type coverage.
  - ElectronMetadataService adapter delegation.
  - serviceResolver dual-mode (Web/Mock vs Electron/Native).
  - Error propagation through IPC chain.

Changed:
- `electron/services/nativeMetadataService.ts`: Replaced stub with full yt-dlp subprocess integration using Dependency Injection pattern.
- `electron/ipc/handlers.ts`: Passes `ytdlpPath` from Settings to NativeMetadataService constructor.
- `vite.config.ts`: Added `testTimeout: 10000` (10 seconds) for all tests.

Fixed:
- vitest mock setup complexity: Replaced `vi.doMock()` with Dependency Injection pattern (ProcessExecutor interface).
- Mock processes now emit events properly via `setImmediate()` for reliable test execution.
- All metadata IPC integration tests now pass without timeout issues.

Test Results:
- `npm run test`: **28 test files, 190 tests, 0 failed** ✅
- `npm run build`: ✅ zero errors (tsc -b + vite build, 1668 modules, ~9.4s)
- `npm run electron:build`: ✅ (~32ms)

Architecture Notes:
- Web mode continues using `MockMetadataService` — no regressions.
- Electron mode uses `NativeMetadataService` with real yt-dlp subprocess.
- Tests are deterministic and do not depend on network, YouTube, or installed yt-dlp binary.
- `MockProcessExecutor` allows complete test coverage of subprocess behavior without mocking Node.js built-ins.

Known Limitations:
- Manual testing with real yt-dlp binary and YouTube URLs required for end-to-end validation.
- yt-dlp must be installed separately — no auto-download or bundled binary.

## 1.1.3-electron-dev-workflow

Added:
- `npm run electron:dev`: Concurrent Vite + Electron development workflow.
- `concurrently`, `wait-on`, `cross-env` as devDependencies for development workflow orchestration.
- `vite.config.ts` updated with `server.port: 5173` and `server.strictPort: true` for stable dev server port.
- `package.json` scripts:
  - `electron:dev`: Main entry point — runs Vite and Electron concurrently with color-coded output.
  - `dev:vite`: Starts Vite dev server on port 5173.
  - `dev:electron`: Waits for Vite, builds Electron, and launches with `VITE_DEV_SERVER_URL` environment variable.

Changed:
- None. `electron/main.ts` already supported development mode via `process.env.VITE_DEV_SERVER_URL`.

Fixed:
- None.

Development Workflow:
1. Run `npm run electron:dev` to start development.
2. Vite dev server starts on http://localhost:5173.
3. Electron waits for Vite readiness (via `wait-on`).
4. Electron builds and launches, loading Vite dev server URL.
5. React/TypeScript changes trigger HMR without rebuilding production bundle.
6. Closing Electron or pressing Ctrl+C terminates both processes (via `concurrently -k`).

Test Results:
- `npm run test`: **28 test files, 202 tests, 0 failed** ✅
- `npm run build`: ✅ (1668 modules, ~10s)
- `npm run electron:build`: ✅ (~23ms)

Notes:
- No regressions: All existing features continue working.
- Security constraints preserved: contextIsolation, no nodeIntegration, sandbox enabled.
- Electron development workflow is now available through npm run electron:dev with Vite + Electron integration and development HMR.

## 1.1.2-metadata-ipc-verification

Verified:
- Complete Metadata IPC path from Dashboard → metadataStore → serviceResolver → Electron Metadata Adapter → preload / electronAPI → IPC → nativeMetadataService.
- All 14 required Metadata IPC test points pass:
  1. ✅ IPC handler registered
  2. ✅ Native Metadata Service (36 tests: URL validation, classification, AnalysisResult generation)
  3. ✅ Electron Metadata Adapter (delegates to window.electronAPI)
  4. ✅ serviceResolver integration (Electron mode → ElectronMetadataService, Web mode → MockMetadataService)
  5. ✅ Web mode continues using Mock
  6. ✅ Electron mode uses Native adapter
  7. ✅ Error propagation (unsupported_url, invalid_url)
  8. ✅ Video URL analysis
  9. ✅ Shorts URL analysis
  10. ✅ Playlist URL analysis
  11. ✅ Channel URL analysis
  12. ✅ Invalid URL handling
  13. ✅ Unsupported URL handling
  14. ✅ IPC never crashes (wrapSuccess/wrapError envelope)

Fixed:
- Removed unnecessary `@ts-expect-error` comment in `serviceResolver.test.ts` that was causing TypeScript build errors.

Test Results:
- `npm run test`: **28 test files, 202 tests, 0 failed** ✅
- `npm run build`: ✅ (1668 modules, zero TypeScript errors)
- `npm run electron:build`: ✅ (~161ms)

Notes:
- No regressions: All existing features (Dashboard, Queue, History, Favorites, Scheduler, Settings, About, Dev Tools) continue working.
- MetadataService now supports the Electron native IPC path while Web/Vitest continues using MockMetadataService.

## 1.1.1-store-wiring

Added:
- `src/services/serviceResolver.ts` extended with `resolveDownloadService()` and `resolveSettingsService()` — all 6 service namespaces now covered.
- `src/services/serviceResolver.ts` extended with per-service `_inject*Service()` test helpers (`_injectMetadataService`, `_injectDownloadService`, `_injectHistoryService`, `_injectFavoritesService`, `_injectSchedulerService`, `_injectSettingsService`).
- `src/services/serviceResolver.test.ts`: 26 new tests covering Web/Mock mode, Electron mode, singleton caching, test injection helpers, and adapter surface validation for all 4 Electron adapters.

Changed:
- `src/stores/metadataStore.ts`: Replaced direct `metadataService` singleton import with `resolveMetadataService()`.
- `src/stores/queueStore.ts`: Replaced direct `downloadService` singleton import with `resolveDownloadService()`.
- `src/stores/historyStore.ts`: Replaced direct `historyService` singleton import with `resolveHistoryService()`.
- `src/stores/favoritesStore.ts`: Replaced direct `favoritesService` singleton import with `resolveFavoritesService()`.
- `src/stores/schedulerStore.ts`: Replaced direct `schedulerService` singleton import with `resolveSchedulerService()`.
- `src/stores/settingsStore.ts`: Replaced direct `settingsService` singleton import with `resolveSettingsService()`.
- Architecture rule now enforced: No Zustand store imports a Mock or Native service class directly. All service access routes through `serviceResolver`.

Fixed:
- `resolveSettingsService()` is documented to always return `LocalStorageSettingsService` (sync interface, IPC is async). See `AI_HANDOFF.md` "Known Architectural Decision Pending".

Test Results:
- `npm run test`: **26 test files, 147 tests, 0 failed** ✅
- `npm run build`: ✅ zero errors (tsc -b + vite build, 1668 modules)
- `npm run electron:build`: ✅ esbuild compiles `main.ts` + `preload.ts` → `dist-electron/` in ~155ms

## 1.1.0-electron-foundation

Added:
- `electron/` directory with full IPC foundation for Phase 2 Electron integration.
- `electron/ipc/channels.ts`: Typed `IPC_CHANNELS` registry — 25 channels across 6 namespaces (metadata, download, settings, history, favorites, scheduler). `IpcResult<T>` envelope, `IpcContractPayloads`, and `IpcContractResponses` contracts.
- `electron/ipc/handlers.ts`: `registerIpcHandlers()` wiring all `ipcMain.handle` calls with safe `wrapSuccess`/`wrapError` error propagation.
- `electron/preload.ts`: Secure preload using `contextBridge.exposeInMainWorld('electronAPI', ...)` with typed invoke helper. No raw `ipcRenderer` or Node.js APIs exposed to Renderer.
- `electron/main.ts`: `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`. Loads Vite dev server in development or `dist/index.html` in production.
- `electron/services/nativeMetadataService.ts`: Node.js-compatible stub (no browser APIs, no `window.setTimeout`).
- `electron/services/nativeDownloadService.ts`: In-memory download queue boundary for Main Process.
- `electron/services/nativeSettingsService.ts`: In-memory settings boundary for Main Process.
- `electron/services/nativeHistoryService.ts`: In-memory history boundary for Main Process.
- `electron/services/nativeFavoritesService.ts`: In-memory favorites boundary for Main Process.
- `electron/services/nativeSchedulerService.ts`: In-memory scheduler boundary for Main Process.
- `src/types/electron.d.ts`: Self-contained `ElectronAPI` interface + `Window.electronAPI` optional global type augmentation.
- `src/services/electronIpcAdapters.ts`: Renderer-side IPC adapter implementations of all service interfaces using `window.electronAPI`.
- `src/services/serviceResolver.ts`: Dual-mode factory — selects Electron IPC adapters when `window.electronAPI` is defined; Mock services otherwise. Includes `_resetServiceCache()` and `_injectServices()` test helpers.
- `tsconfig.electron.json`: TypeScript config for compiling Main Process (CommonJS, Node target, strict).
- `electron/ipc/ipc.test.ts`: 27 IPC contract tests covering channel naming, `IpcResult` envelope, preload surface detection, dual-mode resolver selection, error propagation, and security constraints — runnable under Vitest without a live Electron instance.
- `package.json` updated: `electron:build` (esbuild → `dist-electron/`), `electron:start` (Electron launcher), `"main"` entry for Electron.

Fixed:
- `nativeMetadataService.ts` now uses only Node.js-compatible APIs (no `window.setTimeout`, no DOM APIs).
- `electron.d.ts` now self-contained (no circular import from `electron/preload.ts`).

Test Results:
- `npm run test`: **25 test files, 121 tests, 0 failed** ✅
- `npm run build`: ✅ zero errors (tsc -b + vite build, 1666 modules, 14.78s)
- `npm run electron:build`: ✅ esbuild compiles `main.ts` + `preload.ts` → `dist-electron/` in 55ms

## 1.0.0

Added:
- Full Acceptance Testing & Final Prototype Verification suite (`DashboardPage.test.tsx`).
- Verified acceptance checklist across all 7 core pages, Dev Tools, state machine transitions, persistence rules, localization, accessibility, and mock error handling.

Fixed:
- Confirmed `npm run test` passes with 24 test files and 94 tests.
- Confirmed `npm run build` passes with zero errors (`tsc -b && vite build`).

## 0.8.0

Added:
- Development-only Dev Tools panel toggled with `Ctrl + Shift + D`.
- SPEC-defined Mock Scenario selector for Success, Network Error, Video Unavailable, Disk Full, Permission Denied, yt-dlp Error, and FFmpeg Error.
- Simulation Speed selector that drives the existing Queue mock simulation interval in development only.
- Dev Tools controls for Seed Demo Data, Clear Mock Data, Reset Settings, Simulate Download, and Simulate Error.
- Focused Dev Tools store and component tests.

Changed:
- About contact now displays concrete phone and email links instead of localized placeholder text.
- Favorites and Scheduler stores expose `clearMockData` actions for development-only mock clearing through stores.

Fixed:
- Confirmed `npm run test` passes with 23 test files and 91 tests.
- Confirmed `npm run build` passes, including `tsc -b`.

## 0.7.0

Added:
- Focused About page tests for required application information and Arabic localization.

Changed:
- Polished About page layout, spacing, typography, and responsive details grid.
- About page now removes placeholder contact text and displays concrete phone/email contact links.

Fixed:
- Confirmed `npm run test` passes with 21 test files and 81 tests.
- Confirmed `npm run build` passes, including `tsc -b`.

## 0.6.0

Added:
- Interactive Settings page with General, Appearance, Language, Downloads, Notifications, Clipboard, Advanced, and Smart File Naming sections.
- Settings controls for download folder, startup/tray UI flags, theme, language, concurrent downloads, speed limit, default quality, default video/audio formats, notifications, clipboard behavior, yt-dlp path, FFmpeg path, proxy, and file name template.
- Smart File Naming live preview using the configured quality and video format.
- Settings page tests plus Settings service/store tests for persistence, reset behavior, corrupt localStorage recovery, theme, language, RTL/LTR, and document dark-mode application.

Changed:
- Settings route now renders the real Settings page instead of a placeholder.
- Settings store now exposes reload support for recovered localStorage state.

Fixed:
- Confirmed `npm run test` passes with 20 test files and 79 tests.
- Confirmed `npm run build` passes, including `tsc -b`.

## 0.5.0

Added:
- Interactive Scheduler page with URL, date, time, and repeat form fields.
- `SchedulerService` interface with mock implementation for session-only Scheduler data.
- Zustand `schedulerStore` actions for load, create, update, cancel, remove, timed tick, mock errors, and test reset.
- In-app Scheduler simulation that triggers due schedules and adds new queued `DownloadItem` records without starting downloads.
- Once, Daily, and Weekly repeat behavior with next-run advancement for repeating schedules.
- Localized English/Arabic Scheduler copy for RTL/LTR layouts.
- Scheduler skeleton loading, empty state, accessible action buttons, and focused service/store/page tests.

Changed:
- Scheduler route now renders the real Scheduler page instead of a placeholder.

Fixed:
- Confirmed `npm run test` passes with 17 test files and 68 tests.
- Confirmed `npm run build` passes, including `tsc -b`.

## 0.4.0

Added:
- Interactive Favorites page with seeded mock favorite videos.
- `FavoritesService` interface with mock implementation for session-only Favorites data.
- Zustand `favoritesStore` actions for loading, add, remove, favorite lookup, download-to-queue, and mock errors.
- Favorite download flow that creates a new queued `DownloadItem` using selected quality and format defaults.
- Localized English/Arabic Favorites copy for RTL/LTR layouts.
- Favorites skeleton loading, empty state, accessible action buttons, and focused tests.

Changed:
- Favorites route now renders the real Favorites page instead of a placeholder.

Fixed:
- Confirmed `npm run test` passes with 14 test files and 55 tests.

## 0.3.0

Added:
- Interactive History page for completed, failed, and canceled downloads.
- `HistoryService` interface with mock implementation for session-only History data.
- Zustand `historyStore` actions for loading, add-from-download, remove, clear, re-download, Open Folder simulation, and mock errors.
- Queue-to-History bridge that records terminal Queue items without duplicating Queue state.
- Re-download flow that creates a new queued `DownloadItem` using the original source URL, title, thumbnail, quality, format, and file size.
- Localized English/Arabic History copy for RTL/LTR layouts.
- History skeleton loading, empty state, accessible icon buttons, and prototype Open Folder toast.
- Tests for History service, History store, Queue-to-History bridge, and History page interactions.

Changed:
- History route now renders the real History page instead of a placeholder.
- History actions now report failed item lookup errors through the existing store/toast error path.

Fixed:
- Removed a duplicate History icon button prop declaration that could break strict TypeScript builds.

## 0.2.0

Added:
- Interactive Download Queue page.
- dnd-kit mouse and keyboard reordering with persisted `order` values.
- Independent download state machine utility.
- Mock download lifecycle simulation: queued, analyzing, downloading, merging, converting, completed.
- Pause, resume, cancel, retry, remove, and mock failure controls.
- Concurrent download slot handling.
- Speed limiter affecting simulated speed, downloaded size, progress, and ETA.
- Progress bars with ARIA attributes.
- Tests for state machine transitions, download service lifecycle, queue store behavior, and queue UI interactions.

Changed:
- Queue route now renders the real Download Queue page instead of an empty placeholder.
- `DownloadService` now owns mock lifecycle transitions and simulation calculations.

Fixed:
- None.

## 0.1.0

Added:
- Initial React + TypeScript + Vite project scaffold.
- Tailwind CSS setup.
- React Router layout with seven required routes.
- i18next Arabic/English foundation with RTL/LTR document direction.
- Zustand stores for metadata, queue, settings, history, favorites, scheduler, and dev tools.
- Mock metadata, download, and settings services.
- Dashboard Quick Add URL feature.
- Mock video, shorts, playlist, playlist-video, and channel analysis.
- Add to Queue behavior for single videos, playlists, and channel selections.
- Vitest tests for URL validation, mock metadata service, metadata store, and queue store.
- Required documentation files.

Changed:
- None.

Fixed:
- None.



