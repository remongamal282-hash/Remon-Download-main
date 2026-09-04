/**
 * Preload script — executed in a privileged context between Main and Renderer.
 *
 * Security rules enforced here:
 * - contextIsolation: true  (set in BrowserWindow webPreferences)
 * - nodeIntegration: false  (set in BrowserWindow webPreferences)
 * - Only exposes window.electronAPI via contextBridge.exposeInMainWorld
 * - No raw ipcRenderer exposed to the Renderer
 * - No Node.js fs, path, child_process, or OS APIs exposed
 * - All IPC goes through typed channel strings from IPC_CHANNELS
 */

import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, IPC_EVENTS, type IpcResult, type NotificationPayload } from "./ipc/channels";
import type { AnalysisResult, DownloadItem, FavoriteItem, HistoryItem, ScheduledDownload } from "../src/types/download";
import type { AppSettings } from "../src/types/settings";
import type { ElectronAPI } from "../src/types/electron";

/**
 * Typed IPC invoke helper. Throws if the Main Process returns an error envelope.
 */
async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result: IpcResult<T> = await ipcRenderer.invoke(channel, payload);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data;
}

const electronAPI: ElectronAPI = {
  isElectron: true,

  onNotification: (callback: (data: NotificationPayload) => void): (() => void) => {
    const listener = (_event: unknown, data: NotificationPayload) => callback(data);
    ipcRenderer.on(IPC_EVENTS.NOTIFICATION, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.NOTIFICATION, listener);
  },

  metadata: {
    analyze: (url: string): Promise<AnalysisResult> =>
      invoke(IPC_CHANNELS.METADATA_ANALYZE, { url })
  },

  download: {
    getAll: (): Promise<DownloadItem[]> => invoke(IPC_CHANNELS.DOWNLOAD_GET_ALL),
    add: (item: DownloadItem): Promise<DownloadItem> => invoke(IPC_CHANNELS.DOWNLOAD_ADD, { item }),
    start: (id: string): Promise<DownloadItem> => invoke(IPC_CHANNELS.DOWNLOAD_START, { id }),
    pause: (id: string): Promise<DownloadItem> => invoke(IPC_CHANNELS.DOWNLOAD_PAUSE, { id }),
    resume: (id: string): Promise<DownloadItem> => invoke(IPC_CHANNELS.DOWNLOAD_RESUME, { id }),
    cancel: (id: string): Promise<DownloadItem> => invoke(IPC_CHANNELS.DOWNLOAD_CANCEL, { id }),
    retry: (id: string): Promise<DownloadItem> => invoke(IPC_CHANNELS.DOWNLOAD_RETRY, { id }),
    remove: (id: string): Promise<string> => invoke(IPC_CHANNELS.DOWNLOAD_REMOVE, { id }),
    reorder: (orderedIds: string[]): Promise<DownloadItem[]> =>
      invoke(IPC_CHANNELS.DOWNLOAD_REORDER, { orderedIds }),

    // Event listeners for progress and state changes
    onProgress: (callback: (data: any) => void): (() => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPC_EVENTS.DOWNLOAD_PROGRESS, listener);
      // Return unsubscribe function
      return () => ipcRenderer.removeListener(IPC_EVENTS.DOWNLOAD_PROGRESS, listener);
    },

    onStateChange: (callback: (data: any) => void): (() => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPC_EVENTS.DOWNLOAD_STATE_CHANGE, listener);
      // Return unsubscribe function
      return () => ipcRenderer.removeListener(IPC_EVENTS.DOWNLOAD_STATE_CHANGE, listener);
    },

    openFolder: (path: string): Promise<void> => invoke(IPC_CHANNELS.DOWNLOAD_OPEN_FOLDER, { path })
  },

  settings: {
    get: (): Promise<AppSettings> => invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (settings: Partial<AppSettings>): Promise<AppSettings> =>
      invoke(IPC_CHANNELS.SETTINGS_UPDATE, { settings }),
    reset: (): Promise<AppSettings> => invoke(IPC_CHANNELS.SETTINGS_RESET),
    selectDownloadFolder: (): Promise<string | null> => invoke(IPC_CHANNELS.SETTINGS_SELECT_DOWNLOAD_FOLDER)
  },

  window: {
    minimize: (): Promise<void> => invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    close: (): Promise<void> => invoke(IPC_CHANNELS.WINDOW_CLOSE)
  },

  history: {
    getAll: (): Promise<HistoryItem[]> => invoke(IPC_CHANNELS.HISTORY_GET_ALL),
    add: (item: HistoryItem): Promise<HistoryItem> => invoke(IPC_CHANNELS.HISTORY_ADD, { item }),
    remove: (id: string): Promise<string> => invoke(IPC_CHANNELS.HISTORY_REMOVE, { id }),
    clear: (): Promise<void> => invoke(IPC_CHANNELS.HISTORY_CLEAR)
  },

  favorites: {
    getAll: (): Promise<FavoriteItem[]> => invoke(IPC_CHANNELS.FAVORITES_GET_ALL),
    add: (item: FavoriteItem): Promise<FavoriteItem> => invoke(IPC_CHANNELS.FAVORITES_ADD, { item }),
    remove: (id: string): Promise<string> => invoke(IPC_CHANNELS.FAVORITES_REMOVE, { id })
  },

  scheduler: {
    getAll: (): Promise<ScheduledDownload[]> => invoke(IPC_CHANNELS.SCHEDULER_GET_ALL),
    create: (
      schedule: Omit<ScheduledDownload, "id" | "createdAt" | "updatedAt" | "triggerCount">
    ): Promise<ScheduledDownload> => invoke(IPC_CHANNELS.SCHEDULER_CREATE, { schedule }),
    update: (schedule: ScheduledDownload): Promise<ScheduledDownload> =>
      invoke(IPC_CHANNELS.SCHEDULER_UPDATE, { schedule }),
    cancel: (id: string): Promise<ScheduledDownload> => invoke(IPC_CHANNELS.SCHEDULER_CANCEL, { id }),
    remove: (id: string): Promise<string> => invoke(IPC_CHANNELS.SCHEDULER_REMOVE, { id }),
    tick: (now: number): Promise<{ items: ScheduledDownload[]; triggered: Array<{ schedule: ScheduledDownload; metadata: any }> }> =>
      invoke(IPC_CHANNELS.SCHEDULER_TICK, { now })
  }
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
