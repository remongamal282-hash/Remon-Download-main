import type { AnalysisResult, DownloadItem, FavoriteItem, HistoryItem, ScheduledDownload } from "../../src/types/download";
import type { AppSettings } from "../../src/types/settings";
import type { ErrorModel } from "../../src/types/errors";

export const IPC_CHANNELS = {
  METADATA_ANALYZE: "metadata:analyze",
  DOWNLOAD_GET_ALL: "download:get-all",
  DOWNLOAD_ADD: "download:add",
  DOWNLOAD_START: "download:start",
  DOWNLOAD_PAUSE: "download:pause",
  DOWNLOAD_RESUME: "download:resume",
  DOWNLOAD_CANCEL: "download:cancel",
  DOWNLOAD_RETRY: "download:retry",
  DOWNLOAD_REMOVE: "download:remove",
  DOWNLOAD_REORDER: "download:reorder",
  SETTINGS_GET: "settings:get",
  SETTINGS_UPDATE: "settings:update",
  SETTINGS_RESET: "settings:reset",
  SETTINGS_SELECT_DOWNLOAD_FOLDER: "settings:select-download-folder",
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_CLOSE: "window:close",
  DOWNLOAD_OPEN_FOLDER: "download:open-folder",
  HISTORY_GET_ALL: "history:get-all",
  HISTORY_ADD: "history:add",
  HISTORY_REMOVE: "history:remove",
  HISTORY_CLEAR: "history:clear",
  FAVORITES_GET_ALL: "favorites:get-all",
  FAVORITES_ADD: "favorites:add",
  FAVORITES_REMOVE: "favorites:remove",
  SCHEDULER_GET_ALL: "scheduler:get-all",
  SCHEDULER_CREATE: "scheduler:create",
  SCHEDULER_UPDATE: "scheduler:update",
  SCHEDULER_CANCEL: "scheduler:cancel",
  SCHEDULER_REMOVE: "scheduler:remove",
  SCHEDULER_TICK: "scheduler:tick"
} as const;

/**
 * IPC Event Channels (Main → Renderer push events, not request/response)
 */
export const IPC_EVENTS = {
  DOWNLOAD_PROGRESS: "download:progress",
  DOWNLOAD_STATE_CHANGE: "download:state-change",
  NOTIFICATION: "notification:show"
} as const;

export type IpcEventChannel = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorModel };

export interface IpcContractPayloads {
  [IPC_CHANNELS.METADATA_ANALYZE]: { url: string };
  [IPC_CHANNELS.DOWNLOAD_GET_ALL]: void;
  [IPC_CHANNELS.DOWNLOAD_ADD]: { item: DownloadItem };
  [IPC_CHANNELS.DOWNLOAD_START]: { id: string };
  [IPC_CHANNELS.DOWNLOAD_PAUSE]: { id: string };
  [IPC_CHANNELS.DOWNLOAD_RESUME]: { id: string };
  [IPC_CHANNELS.DOWNLOAD_CANCEL]: { id: string };
  [IPC_CHANNELS.DOWNLOAD_RETRY]: { id: string };
  [IPC_CHANNELS.DOWNLOAD_REMOVE]: { id: string };
  [IPC_CHANNELS.DOWNLOAD_REORDER]: { orderedIds: string[] };
  [IPC_CHANNELS.SETTINGS_GET]: void;
  [IPC_CHANNELS.SETTINGS_UPDATE]: { settings: Partial<AppSettings> };
  [IPC_CHANNELS.SETTINGS_RESET]: void;
  [IPC_CHANNELS.SETTINGS_SELECT_DOWNLOAD_FOLDER]: void;
  [IPC_CHANNELS.WINDOW_MINIMIZE]: void;
  [IPC_CHANNELS.WINDOW_CLOSE]: void;
  [IPC_CHANNELS.DOWNLOAD_OPEN_FOLDER]: { path: string };
  [IPC_CHANNELS.HISTORY_GET_ALL]: void;
  [IPC_CHANNELS.HISTORY_ADD]: { item: HistoryItem };
  [IPC_CHANNELS.HISTORY_REMOVE]: { id: string };
  [IPC_CHANNELS.HISTORY_CLEAR]: void;
  [IPC_CHANNELS.FAVORITES_GET_ALL]: void;
  [IPC_CHANNELS.FAVORITES_ADD]: { item: FavoriteItem };
  [IPC_CHANNELS.FAVORITES_REMOVE]: { id: string };
  [IPC_CHANNELS.SCHEDULER_GET_ALL]: void;
  [IPC_CHANNELS.SCHEDULER_CREATE]: { schedule: Omit<ScheduledDownload, "id" | "createdAt" | "updatedAt" | "triggerCount"> };
  [IPC_CHANNELS.SCHEDULER_UPDATE]: { schedule: ScheduledDownload };
  [IPC_CHANNELS.SCHEDULER_CANCEL]: { id: string };
  [IPC_CHANNELS.SCHEDULER_REMOVE]: { id: string };
  [IPC_CHANNELS.SCHEDULER_TICK]: { now: number };
}

export interface IpcContractResponses {
  [IPC_CHANNELS.METADATA_ANALYZE]: AnalysisResult;
  [IPC_CHANNELS.DOWNLOAD_GET_ALL]: DownloadItem[];
  [IPC_CHANNELS.DOWNLOAD_ADD]: DownloadItem;
  [IPC_CHANNELS.DOWNLOAD_START]: DownloadItem;
  [IPC_CHANNELS.DOWNLOAD_PAUSE]: DownloadItem;
  [IPC_CHANNELS.DOWNLOAD_RESUME]: DownloadItem;
  [IPC_CHANNELS.DOWNLOAD_CANCEL]: DownloadItem;
  [IPC_CHANNELS.DOWNLOAD_RETRY]: DownloadItem;
  [IPC_CHANNELS.DOWNLOAD_REMOVE]: string;
  [IPC_CHANNELS.DOWNLOAD_REORDER]: DownloadItem[];
  [IPC_CHANNELS.SETTINGS_GET]: AppSettings;
  [IPC_CHANNELS.SETTINGS_UPDATE]: AppSettings;
  [IPC_CHANNELS.SETTINGS_RESET]: AppSettings;
  [IPC_CHANNELS.SETTINGS_SELECT_DOWNLOAD_FOLDER]: string | null;
  [IPC_CHANNELS.WINDOW_MINIMIZE]: void;
  [IPC_CHANNELS.WINDOW_CLOSE]: void;
  [IPC_CHANNELS.DOWNLOAD_OPEN_FOLDER]: void;
  [IPC_CHANNELS.HISTORY_GET_ALL]: HistoryItem[];
  [IPC_CHANNELS.HISTORY_ADD]: HistoryItem;
  [IPC_CHANNELS.HISTORY_REMOVE]: string;
  [IPC_CHANNELS.HISTORY_CLEAR]: void;
  [IPC_CHANNELS.FAVORITES_GET_ALL]: FavoriteItem[];
  [IPC_CHANNELS.FAVORITES_ADD]: FavoriteItem;
  [IPC_CHANNELS.FAVORITES_REMOVE]: string;
  [IPC_CHANNELS.SCHEDULER_GET_ALL]: ScheduledDownload[];
  [IPC_CHANNELS.SCHEDULER_CREATE]: ScheduledDownload;
  [IPC_CHANNELS.SCHEDULER_UPDATE]: ScheduledDownload;
  [IPC_CHANNELS.SCHEDULER_CANCEL]: ScheduledDownload;
  [IPC_CHANNELS.SCHEDULER_REMOVE]: string;
  [IPC_CHANNELS.SCHEDULER_TICK]: { items: ScheduledDownload[]; triggered: Array<{ schedule: ScheduledDownload; metadata: import("../../src/types/download").VideoMetadata[] }> };
}

/**
 * IPC Event Payloads (Main → Renderer push events)
 */
export interface DownloadProgressPayload {
  id: string;
  progress: number;
  downloadedSize: number;
  totalSize: number;
  speed: number;
  eta: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  thumbnail?: string;
}

export interface DownloadStateChangePayload {
  id: string;
  status: import("../../src/types/download").DownloadStatus;
  progress: number;
  downloadedSize: number;
  fileSize?: number;
  speed: number;
  eta: string;
  errorCode?: import("../../src/types/errors").AppErrorCode;
  errorMessage?: string;
}

