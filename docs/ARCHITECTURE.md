# Remon Download Architecture

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- React Router
- Zustand for global state only
- Service interfaces with mock implementations
- Electron (Phase 2) for native desktop capabilities

## Windows Packaging (Phase 3.5)

electron-builder produces an NSIS installer as the official distribution and a Portable executable as an optional build. `asar` contains application code; `yt-dlp.exe`, `ffmpeg.exe`, and `ffprobe.exe` are supplied through `extraResources` at `resources/runtime` so Main Process `spawn` can execute them. Persistent JSON data stays under `app.getPath("userData")`, outside the installation directory.

## Layered Data Flow

### Web / Vitest Mode

```text
React Components
      ↓
Zustand Stores
      ↓
Service Interfaces
      ↓
Mock Service Implementations
  (MockMetadataService, MockHistoryService, etc.)
```

### Electron Mode (Phase 2)

```text
React Components (Renderer Process)
      ↓
Zustand Stores
      ↓
Service Interfaces
      ↓
serviceResolver.ts   ← detects window.electronAPI
      ↓
Electron IPC Adapters  (src/services/electronIpcAdapters.ts)
      ↓
window.electronAPI   ← contextBridge in preload.ts
      ↓
ipcRenderer.invoke(channel, payload)
      ↓
ipcMain.handle (electron/ipc/handlers.ts)
      ↓
Native Services  (electron/services/native*.ts)
      ↓
ProcessExecutor  ← Dependency Injection for subprocess execution
      ↓
Node.js / yt-dlp / FFmpeg / File System
```

Components and stores are **identical** in both modes. Only the bottom layer changes.

## Security Constraints (Electron)

| Constraint | Value |
|---|---|
| `contextIsolation` | `true` |
| `nodeIntegration` | `false` |
| `sandbox` | `true` |
| `webSecurity` | `true` |
| Preload entry | `electron/preload.ts` via `contextBridge` |
| Node.js exposure | None — zero raw Node APIs in Renderer |
| IPC style | Typed channels only, no arbitrary shell access |
| Renderer IPC access | `window.electronAPI` (preload-injected) only |

## Project Structure

```text
d:/Remon-Download/
├── electron/
│   ├── ipc/
│   │   ├── channels.ts        — IPC_CHANNELS, IpcResult<T>, typed contracts
│   │   ├── handlers.ts        — registerIpcHandlers() via ipcMain.handle
│   │   ├── ipc.test.ts        — 27 IPC contract tests (Vitest, no Electron needed)
│   │   └── metadataIpc.test.ts — 19 Metadata IPC integration tests
│   ├── services/
│   │   ├── nativeMetadataService.ts      — ProcessExecutor DI, yt-dlp integration, 24 tests
│   │   ├── nativeMetadataService.test.ts — Vitest tests with MockProcessExecutor
│   │   ├── nativeDownloadService.ts
│   │   ├── nativeSettingsService.ts
│   │   ├── nativeHistoryService.ts
│   │   ├── nativeFavoritesService.ts
│   │   └── nativeSchedulerService.ts
│   ├── main.ts                — BrowserWindow + security defaults + load URL
│   └── preload.ts             — contextBridge.exposeInMainWorld('electronAPI', ...)
├── src/
│   ├── components/
│   ├── constants/
│   ├── i18n/
│   ├── layouts/
│   ├── pages/
│   ├── services/
│   │   ├── metadataService.ts         — MetadataService interface + MockMetadataService
│   │   ├── downloadService.ts         — DownloadService interface + MockDownloadService
│   │   ├── historyService.ts          — HistoryService interface + MockHistoryService
│   │   ├── favoritesService.ts        — FavoritesService interface + MockFavoritesService
│   │   ├── schedulerService.ts        — SchedulerService interface + MockSchedulerService
│   │   ├── settingsService.ts         — SettingsService interface + LocalStorageSettingsService
│   │   ├── electronIpcAdapters.ts     — Renderer IPC adapters (one per service)
│   │   └── serviceResolver.ts         — Dual-mode factory (Electron vs Mock)
│   ├── stores/
│   ├── test/
│   ├── types/
│   │   └── electron.d.ts      — ElectronAPI interface + Window augmentation
│   └── utils/
├── dist/                      — Vite Renderer production build
├── dist-electron/             — esbuild Main Process + Preload build
├── vite.config.ts             — Vite config (port 5173, strictPort, test setup)
├── tsconfig.app.json          — Renderer TypeScript (ESNext, DOM)
├── tsconfig.electron.json     — Main Process TypeScript (CommonJS, Node)
└── tsconfig.node.json         — Vite config TypeScript
```

## Development Workflow

### Web Development (Browser only)
```bash
npm run dev
```
- Vite dev server on http://localhost:5173
- Hot Module Replacement (HMR) for React/TypeScript
- Uses Mock services (no Electron)

### Electron Development (Full App)
```bash
npm run electron:dev
```
- Concurrent Vite dev server + Electron process
- Vite runs on port 5173 (fixed with `strictPort: true`)
- `wait-on` ensures Electron waits for Vite readiness
- Electron loads Vite dev server URL (via `VITE_DEV_SERVER_URL` environment variable)
- HMR works seamlessly in Electron window
- Both processes terminate together (Ctrl+C or closing Electron)

### Production Build
```bash
npm run build              # Build Renderer (dist/)
npm run electron:build     # Build Main Process (dist-electron/)
npm run electron:start     # Launch production Electron app
```

## Environment Detection (Electron Main Process)

`electron/main.ts` detects development vs production mode:

```ts
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
if (devServerUrl) {
  mainWindow.loadURL(devServerUrl);  // Development: Load Vite dev server
} else {
  mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));  // Production: Load built files
}
```

- **Development**: `VITE_DEV_SERVER_URL=http://localhost:5173` passed by `cross-env` in `electron:dev` script
- **Production**: Environment variable not set, loads from `dist/`

## Stores

- `metadataStore`: manages current Dashboard analysis state.
- `queueStore`: session-only queue items, ordering, lifecycle controls, mock errors, concurrency slots, and simulation ticks.
- `settingsStore`: localStorage-backed settings and document language/theme application.
- `historyStore`: session-only History items, loading/error state, remove/clear behavior, Re-download back into Queue, and Open Folder prototype simulation.
- `favoritesStore`: session-only Favorites items, loading/error state, remove behavior, Download back into Queue, mock clear support, and mock error injection.
- `schedulerStore`: session-only Scheduler items, loading/error state, create/update/cancel/remove/tick behavior, trigger-to-Queue behavior, mock clear support, and mock error injection.
- `devToolsStore`: development-only `mockScenario`, `simulationSpeed`, and `isPanelOpen` state.

## Services

- `MetadataService`: mock YouTube URL analysis (Renderer) / yt-dlp execution (Main Process).
- `DownloadService`: creates queue items, enforces state transitions through the state machine, applies retry/failure semantics, and computes mock download progress.
- `HistoryService`: History data access through a service interface.
- `FavoritesService`: Favorites data access through a service interface.
- `SchedulerService`: Scheduler data access and timing simulation through a service interface.
- `SettingsService`: reads, validates, repairs, updates, and resets settings.

## ProcessExecutor Pattern (Native Services)

Native services that spawn child processes use the **Dependency Injection** pattern with a `ProcessExecutor` interface:

```ts
interface ProcessExecutor {
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess;
  checkAccess(path: string, mode?: number): Promise<void>;
}
```

### Implementations

1. **DefaultProcessExecutor** (Production):
   - Uses Node.js `child_process.spawn()` and `fs.promises.access()`.
   - Automatically injected when service is instantiated without explicit executor.

2. **MockProcessExecutor** (Testing):
   - Configurable test double with `setSpawnBehavior()` and `setAccessBehavior()`.
   - Emits stdout/stderr/exit events asynchronously using `setImmediate()`.
   - Enables deterministic testing without network or installed binaries.

### Why Not vi.mock()?

Vitest's `vi.mock("child_process")` had complex hoisting issues:
- Module hoisting conflicts with per-test behavior configuration.
- `vi.doMock()` failed with "No default export" errors.
- Hard to simulate different subprocess behaviors per test.

The ProcessExecutor interface provides:
- Clean separation of concerns.
- Type-safe dependency injection.
- Full control over subprocess behavior in tests.
- Zero network dependency in test suite.

### Usage Example

```ts
// Production (automatic)
const service = new NativeMetadataService(settingsService);

// Testing (explicit injection)
const mockExecutor = new MockProcessExecutor();
mockExecutor.setSpawnBehavior({
  stdout: '{"title": "Test Video"}',
  stderr: '',
  exitCode: 0
});
const service = new NativeMetadataService(settingsService, mockExecutor);
```

## IPC Channel Registry (`electron/ipc/channels.ts`)

25 channels across 6 namespaces:

| Namespace | Channels |
|---|---|
| `metadata:` | `analyze` |
| `download:` | `get-all`, `add`, `start`, `pause`, `resume`, `cancel`, `retry`, `remove`, `reorder` |
| `settings:` | `get`, `update`, `reset` |
| `history:` | `get-all`, `add`, `remove`, `clear` |
| `favorites:` | `get-all`, `add`, `remove` |
| `scheduler:` | `get-all`, `create`, `update`, `cancel`, `remove` |

All IPC calls return `IpcResult<T>` — either `{ success: true, data: T }` or `{ success: false, error: ErrorModel }`.

## Service Resolver Dual-Mode

`serviceResolver.ts` detects the execution environment at runtime:

```ts
function isElectronEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
}
```

- **`true`** → IPC adapters from `electronIpcAdapters.ts`
- **`false`** → Mock services from existing mock classes

Mock services are never deleted and remain fully functional for Web mode and Vitest.

## Download Queue

- State machine logic lives in `src/utils/stateMachine.ts`.
- Mock speed and ETA helpers live in `src/utils/downloadSimulation.ts`.
- `QueuePage` uses `@dnd-kit/core` and `@dnd-kit/sortable` for mouse and keyboard reordering.
- Queue lifecycle is driven by a UI interval calling `queueStore.tick()`.
- Speed limit and concurrent download values come from `settingsStore`.
- Dev Tools Simulation Speed can change the development-only Queue tick interval.

## History

- `HistoryPage` reads from `historyStore`; it does not call services directly.
- `QueueHistoryBridge` records Queue items in History once they reach `completed`, `failed`, or `canceled`.
- History stores `HistoryItem` records, not duplicate live `DownloadItem` state.
- Re-download creates a new queued `DownloadItem` through `queueStore.addFromHistoryItem`.
- Open Folder is a prototype toast only, with no filesystem, shell, Electron, or native OS access.

## Dev Tools

- `DevToolsPanel` is rendered only when `import.meta.env.DEV` is true.
- `Ctrl + Shift + D` toggles the panel through `devToolsStore`.
- Mock Scenario selection is stored in `devToolsStore` and is limited to the SPEC-defined scenarios.
- Simulate Error routes through `queueStore.simulateError`, preserving the state machine failure path.
- Seed Demo Data and Simulate Download add queued mock `DownloadItem` records without auto-starting downloads.
- Clear Mock Data uses store actions for Queue, Metadata, History, Favorites, and Scheduler session/mock data. It does not clear persisted Settings.

## System Tray Integration (Phase 3.2)

The System Tray provides Windows desktop integration for background operation of downloads and scheduled tasks without requiring the main window to be open.

### Tray Module (`electron/tray.ts`)

Single-responsibility module for tray lifecycle management:

```ts
export function createTray(mainWindow: BrowserWindow): Tray
export function showWindow(mainWindow: BrowserWindow | null): void
export function hideWindow(mainWindow: BrowserWindow | null): void
export function minimizeToTray(mainWindow: BrowserWindow | null): void
export function quitApplication(): void
export function destroyTray(): void
export function hasTray(): boolean
export function getTray(): Tray | null
```

### Context Menu

Created with `Menu.buildFromTemplate()` in `createTray()`:

| Option | Action | Method |
|---|---|---|
| Show Remon Download | `showWindow()` + `focus()` | Restores window to foreground |
| Hide Remon Download | `hideWindow()` | Hides window, keeps app running |
| _(Separator)_ | — | Visual divider |
| Quit Remon Download | `quitApplication()` | Calls `app.quit()` for graceful shutdown |

### Click Behavior

- **Left click** (single): Calls `showWindow(mainWindow)` to restore and focus.
- **Right click**: Opens context menu (automatic via Electron).

### Window Lifecycle

**Design Goal**: Separate window close from application quit.

| Event | Old Behavior | New Behavior (Tray) |
|---|---|---|
| X button pressed | Closes window, exits app | Prevents close, hides to tray |
| Minimize button | Minimizes to taskbar | Hides to tray |
| window-all-closed (Windows) | Exits app | Prevented (app continues) |
| Tray "Hide" | N/A | `hideWindow()` |
| Tray "Show" | N/A | `showWindow()` + `focus()` |
| Tray "Quit" | N/A | `app.quit()` → graceful shutdown |
| before-quit | N/A | `destroyTray()` before exit |
| app.activate | Createwindow if none exists | Restore hidden window if exists |

### Main Process Implementation (`electron/main.ts`)

**Initialization**:
```ts
app.whenReady().then(() => {
  createWindow();
  if (mainWindow) {
    createTray(mainWindow);  // Create tray after window
  }
  // ...
});
```

**Window close prevention**:
```ts
mainWindow.on("close", (event) => {
  if (mainWindow) {
    event.preventDefault();
    hideWindow(mainWindow);
  }
});
```

**Minimize to tray**:
```ts
mainWindow.on("minimize", () => {
  if (mainWindow) {
    minimizeToTray(mainWindow);
  }
});
```

**Window-all-closed prevention**:
```ts
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Intentionally prevent app.quit() — tray remains active
    console.log("[Main] All windows closed, but app continues running (tray still active)");
  }
});
```

**Cleanup on quit**:
```ts
app.on("before-quit", () => {
  destroyTray();  // Destroy tray before process exit
});
```

### IPC Integration

**No new IPC channels added.** Existing channels reused:

- `WINDOW_CLOSE` handler: Now calls `hideWindow()` instead of `window.close()`
- `WINDOW_MINIMIZE` handler: Calls `minimize()` (minimize event does tray action)

This maintains backward compatibility with existing Renderer code (AppLayout.tsx, etc.).

### Service Continuity While Hidden

All services continue running when the main window is hidden:

| Service | Behavior When Hidden |
|---|---|
| **NativeDownloadService** | Continues yt-dlp subprocess execution, progress parsing, pause/resume |
| **IPC Handlers** | Remain registered via `ipcMain.handle()` |
| **NativeSchedulerService** | Continues ticking, checks trigger conditions |
| **File I/O** | Settings, History, Favorites persist normally |

Download progress events (`download:progress`, `download:state-change`) continue to be emitted and received by any Renderer windows that may open later.

### Single Instance Guarantee

`createTray()` checks `hasTray()` before creating:
```ts
export function createTray(mainWindow: BrowserWindow): Tray {
  if (tray) {
    console.warn("[Tray] Tray already exists, returning existing instance");
    return tray;
  }
  // ... create tray
}
```

This prevents accidental duplicate Tray instances even if the function is called multiple times.

### Known Behaviors and Design Decisions

1. **X button hides to tray, not close**: Intentional to prevent accidental app exit while downloads or scheduled tasks are active.
2. **Tray is mandatory**: Phase 3.2 does not include settings to disable tray behavior.
3. **Minimize goes to tray, not taskbar**: Consistent with "always in background" design.
4. **window-all-closed is prevented on Windows**: Allows app to remain active via tray while all windows are closed.
5. **Only "Quit" exits the app completely**: This is the explicit user action to terminate the process.

## Known Architectural Decision Pending

**SettingsService sync/async mismatch**: The `SettingsService` interface is synchronous (`get(): AppSettings`) to support `LocalStorageSettingsService`. The Electron IPC layer is inherently async. The `ElectronSettingsService` adapter documents this and throws on sync calls. Resolution options:
1. Change `SettingsService.get()` to `Promise<AppSettings>` and update all consumers.
2. Initialize the settings store with an async load on app start and cache the result.

This decision requires user approval before implementation.
