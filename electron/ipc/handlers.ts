import { app, ipcMain, BrowserWindow, dialog, shell } from "electron";
import { IPC_CHANNELS, IPC_EVENTS, type IpcResult, type DownloadProgressPayload, type DownloadStateChangePayload } from "./channels";
import { NativeMetadataService } from "../services/nativeMetadataService";
import { NativeDownloadService } from "../services/nativeDownloadService";
import { NativeSettingsService } from "../services/nativeSettingsService";
import { NativeSchedulerService } from "../services/nativeSchedulerService";
import { NativeHistoryService } from "../services/nativeHistoryService";
import { NativeFavoritesService } from "../services/nativeFavoritesService";
import { NativeNotificationService } from "../services/nativeNotificationService";
import { hideWindow } from "../tray";
import type { ErrorModel } from "../../src/types/errors";

interface RegisterIpcHandlersOptions {
  schedulerService?: NativeSchedulerService;
  onDownloadServiceReady?: (service: NativeDownloadService) => void;
  onNotificationServiceReady?: (service: NativeNotificationService) => void;
  onMinimizeToTrayChanged?: (enabled: boolean, window: BrowserWindow) => void;
  onWindowMinimize?: (window: BrowserWindow) => void;
}

function wrapSuccess<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

function wrapError<T>(err: unknown): IpcResult<T> {
  const message = err instanceof Error ? err.message : String(err);
  const errorModel: ErrorModel = {
    code: "unknown",
    message,
    recoverable: true
  };
  return { success: false, error: errorModel };
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions = {}): void {
  const settingsService = new NativeSettingsService();
  const historyService = new NativeHistoryService();
  const favoritesService = new NativeFavoritesService();
  const schedulerService = options.schedulerService ?? new NativeSchedulerService();
  let notificationService: NativeNotificationService | null = null;

  // Initialize services with persistent storage
  const initServices = async () => {
    try {
      await settingsService.initialize();
      console.log('[IPC] NativeSettingsService initialized');
    } catch (err) {
      console.error('[IPC] Failed to initialize NativeSettingsService:', err);
    }

    try {
      await historyService.initialize();
      console.log('[IPC] NativeHistoryService initialized');
    } catch (err) {
      console.error('[IPC] Failed to initialize NativeHistoryService:', err);
    }

    try {
      await favoritesService.initialize();
      console.log('[IPC] NativeFavoritesService initialized');
    } catch (err) {
      console.error('[IPC] Failed to initialize NativeFavoritesService:', err);
    }

    try {
      await schedulerService.initialize();
      console.log('[IPC] NativeSchedulerService initialized');
    } catch (err) {
      console.error('[IPC] Failed to initialize NativeSchedulerService:', err);
    }
  };

  // Initialize on startup
  void initServices();

  // Initialize NativeDownloadService with settings (async)
  let downloadService: NativeDownloadService | null = null;
  let downloadServiceReady = false;
  const downloadItems = new Map<string, import("../../src/types/download").DownloadItem>();
  let startQueuedDownloadsPromise: Promise<void> = Promise.resolve();

  const startQueuedDownloads = async (): Promise<void> => {
    const service = await ensureDownloadService();
    const settings = await settingsService.get();
    const items = await service.getAll();
    const activeStatuses = ["downloading", "retrying", "merging", "converting"];
    let availableSlots = Math.max(
      0,
      settings.concurrentDownloads - items.filter((item) => activeStatuses.includes(item.status)).length
    );

    for (const item of items.sort((left, right) => left.order - right.order)) {
      if (availableSlots <= 0) {
        break;
      }

      if (item.status !== "queued") {
        continue;
      }

      try {
        await service.start(item.id);
        availableSlots -= 1;
      } catch (error) {
        console.error(`[IPC] Failed to auto-start queued download ${item.id}:`, error);
      }
    }
  };

  const queueAutoStart = (): void => {
    startQueuedDownloadsPromise = startQueuedDownloadsPromise
      .then(() => startQueuedDownloads())
      .catch((error) => {
        console.error("[IPC] Failed to start queued downloads:", error);
      });
  };

  const initDownloadService = async () => {
    try {
      const settings = await settingsService.get();
      downloadService = new NativeDownloadService(settings);
      options.onDownloadServiceReady?.(downloadService);
      notificationService = notificationService ?? new NativeNotificationService(settings);
      options.onNotificationServiceReady?.(notificationService);
      downloadServiceReady = true;

      // Forward download progress events to Renderer
      downloadService.on("download:progress", (payload: DownloadProgressPayload) => {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
          win.webContents.send(IPC_EVENTS.DOWNLOAD_PROGRESS, payload);
        });
      });

      // Forward download state change events to Renderer
      downloadService.on("download:state-change", (payload: DownloadStateChangePayload) => {
        const cachedItem = downloadItems.get(payload.id);
        if (cachedItem) {
          downloadItems.set(payload.id, {
            ...cachedItem,
            status: payload.status,
            progress: payload.progress,
            downloadedSize: payload.downloadedSize,
            fileSize: payload.fileSize ?? cachedItem.fileSize,
            speed: payload.speed,
            eta: payload.eta,
            errorMessage: payload.errorMessage,
            errorCode: payload.errorCode,
            lastUpdatedAt: Date.now()
          });
        }

        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
          win.webContents.send(IPC_EVENTS.DOWNLOAD_STATE_CHANGE, payload);
        });

        const item = downloadItems.get(payload.id);
        if (item) {
          notificationService?.handleDownloadStateChange(payload, item);
        } else {
          void downloadService?.getAll().then((items) => {
            const uncachedItem = items.find((downloadItem) => downloadItem.id === payload.id);
            if (uncachedItem) {
              notificationService?.handleDownloadStateChange(payload, uncachedItem);
              return;
            }

            console.warn(`[IPC] Download notification skipped; item not found: ${payload.id}`);
          }).catch((error) => {
            console.error(`[IPC] Failed to load download for notification: ${payload.id}`, error);
          });
        }
      });
    } catch (err) {
      console.error("Failed to initialize NativeDownloadService:", err);
    }
  };

  // Initialize on first call
  void initDownloadService();

  // Helper to ensure downloadService is ready
  const ensureDownloadService = async (): Promise<NativeDownloadService> => {
    if (!downloadServiceReady || !downloadService) {
      await initDownloadService();
      if (!downloadService) {
        throw new Error("Failed to initialize download service");
      }
    }
    return downloadService;
  };

  // Metadata - creates new instance per request to use latest settings
  ipcMain.handle(IPC_CHANNELS.METADATA_ANALYZE, async (_, { url }) => {
    try {
      console.log(`[IPC] METADATA_ANALYZE requested for URL: ${url}`);
      const settings = await settingsService.get();
      const metadataService = new NativeMetadataService(settings.ytdlpPath);
      const data = await metadataService.analyze(url);
      console.log(`[IPC] METADATA_ANALYZE succeeded for URL: ${url}`);
      return wrapSuccess(data);
    } catch (err) {
      console.error(`[IPC] METADATA_ANALYZE failed for URL (${url}):`, err);
      return wrapError(err);
    }
  });

  // Download
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_GET_ALL, async () => {
    try {
      const service = await ensureDownloadService();
      const data = await service.getAll();
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_ADD, async (_, { item }) => {
    try {
      const service = await ensureDownloadService();
      const data = await service.add(item);
      downloadItems.set(data.id, data);
      queueAutoStart();
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_START, async (_, { id }) => {
    try {
      const service = await ensureDownloadService();
      const data = await service.start(id);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_PAUSE, async (_, { id }) => {
    try {
      const service = await ensureDownloadService();
      const data = await service.pause(id);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_RESUME, async (_, { id }) => {
    try {
      const service = await ensureDownloadService();
      const data = await service.resume(id);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_CANCEL, async (_, { id }) => {
    try {
      const service = await ensureDownloadService();
      const data = await service.cancel(id);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_RETRY, async (_, { id }) => {
    try {
      const service = await ensureDownloadService();
      const data = await service.retry(id);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_REMOVE, async (_, { id }) => {
    try {
      const service = await ensureDownloadService();
      const data = await service.remove(id);
      downloadItems.delete(id);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_REORDER, async (_, { orderedIds }) => {
    try {
      const service = await ensureDownloadService();
      const data = await service.reorder(orderedIds);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  // Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    try {
      const data = await settingsService.get();
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  // SETTINGS_UPDATE handler already defined above (with downloadService.updateSettings)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_, { settings }) => {
    try {
      const data = await settingsService.update(settings);
      if (downloadService) {
        downloadService.updateSettings(data);
      }
      notificationService?.updateSettings(data);
      if (process.platform === "win32" && typeof app.setLoginItemSettings === "function") {
        app.setLoginItemSettings({ openAtLogin: data.startWithWindows });
      }
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (focusedWindow) {
        options.onMinimizeToTrayChanged?.(data.minimizeToTray, focusedWindow);
      }
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_RESET, async () => {
    try {
      const data = await settingsService.reset();
      if (downloadService) {
        downloadService.updateSettings(data);
      }
      notificationService?.updateSettings(data);
      if (process.platform === "win32" && typeof app.setLoginItemSettings === "function") {
        app.setLoginItemSettings({ openAtLogin: data.startWithWindows });
      }
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (focusedWindow) {
        options.onMinimizeToTrayChanged?.(data.minimizeToTray, focusedWindow);
      }
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      options.onWindowMinimize?.(focusedWindow);
    }
    return wrapSuccess(undefined);
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      hideWindow(focusedWindow);
    }
    return wrapSuccess(undefined);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SELECT_DOWNLOAD_FOLDER, async () => {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(focusedWindow || new BrowserWindow(), {
        properties: ["openDirectory"]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return wrapSuccess(null);
      }

      const folderPath = result.filePaths[0];
      // Update settings with the new download folder
      const updatedSettings = await settingsService.update({ downloadFolder: folderPath });
      if (downloadService) {
        downloadService.updateSettings(updatedSettings);
      }

      return wrapSuccess(folderPath);
    } catch (err) {
      return wrapError(err);
    }
  });

  function resolveDownloadFolderPath(folderPath: string): string {
    if (!folderPath || folderPath.trim() === "") {
      return app.getPath("downloads");
    }

    if (folderPath === "~") {
      return app.getPath("home");
    }

    if (folderPath.startsWith("~/")) {
      return `${app.getPath("home")}${folderPath.slice(1)}`;
    }

    if (folderPath.startsWith("~\\")) {
      return `${app.getPath("home")}${folderPath.slice(1)}`;
    }

    return folderPath;
  }

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_OPEN_FOLDER, async (_, { path }) => {
    try {
      const folderPath = resolveDownloadFolderPath(path ?? "");
      await shell.openPath(folderPath);
      return wrapSuccess(undefined);
    } catch (err) {
      return wrapError(err);
    }
  });

  // History
  ipcMain.handle(IPC_CHANNELS.HISTORY_GET_ALL, async () => {
    try {
      const data = await historyService.getAll();
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_ADD, async (_, { item }) => {
    try {
      const data = await historyService.add(item);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_REMOVE, async (_, { id }) => {
    try {
      const data = await historyService.remove(id);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, async () => {
    try {
      await historyService.clear();
      return wrapSuccess(undefined);
    } catch (err) {
      return wrapError(err);
    }
  });

  // Favorites
  ipcMain.handle(IPC_CHANNELS.FAVORITES_GET_ALL, async () => {
    try {
      const data = await favoritesService.getAll();
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FAVORITES_ADD, async (_, { item }) => {
    try {
      const data = await favoritesService.add(item);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FAVORITES_REMOVE, async (_, { id }) => {
    try {
      const data = await favoritesService.remove(id);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  // Scheduler
  ipcMain.handle(IPC_CHANNELS.SCHEDULER_GET_ALL, async () => {
    try {
      const data = await schedulerService.getAll();
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_CREATE, async (_, { schedule }) => {
    try {
      const data = await schedulerService.create(schedule);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_UPDATE, async (_, { schedule }) => {
    try {
      const data = await schedulerService.update(schedule);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_CANCEL, async (_, { id }) => {
    try {
      const data = await schedulerService.cancel(id);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_REMOVE, async (_, { id }) => {
    try {
      const data = await schedulerService.remove(id);
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCHEDULER_TICK, async (_, { now }) => {
    try {
      const data = await schedulerService.tick(now);
      const settings = await settingsService.get();
      notificationService = notificationService ?? new NativeNotificationService(settings);
      notificationService.updateSettings(settings);
      data.triggered.forEach(({ schedule, metadata }) => {
        notificationService?.notifyScheduledDownload(schedule, metadata[0]);
      });
      return wrapSuccess(data);
    } catch (err) {
      return wrapError(err);
    }
  });
}
