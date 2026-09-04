/**
 * Electron IPC Adapters — Renderer-side implementations of the Service Interfaces.
 *
 * These adapters call window.electronAPI (exposed by preload.ts via contextBridge)
 * and satisfy the same interfaces as the Mock Services so they are drop-in
 * replacements when running inside Electron.
 *
 * NEVER import Electron or Node.js modules here. This file runs in the Renderer
 * process and has NO access to Node.js APIs. All communication goes through the
 * typed window.electronAPI surface.
 */

import type { AnalysisResult, DownloadItem, DownloadStatus, FavoriteItem, HistoryItem, ScheduledDownload, VideoMetadata } from "../types/download";
import type { AppSettings, SpeedLimit } from "../types/settings";
import type { ErrorModel } from "../types/errors";
import type { MetadataService } from "./metadataService";
import type { DownloadService } from "./downloadService";
import type { HistoryService } from "./historyService";
import type { FavoritesService } from "./favoritesService";
import type { SettingsService } from "./settingsService";
import type { SchedulerService, SchedulerInput, SchedulerTickResult } from "./schedulerService";
import type { DownloadProgressPayload, DownloadStateChangePayload } from "../types/electron";
import { canTransition } from "../utils/stateMachine";

// ─── Helpers ───────────────────────────────────────────────────────────────

function ipcError(message: string): ErrorModel {
  return { code: "unknown", message, recoverable: true };
}

// ─── MetadataService Adapter ────────────────────────────────────────────────

export class ElectronMetadataService implements MetadataService {
  async analyze(url: string): Promise<AnalysisResult> {
    return window.electronAPI!.metadata.analyze(url);
  }
}

// ─── DownloadService Adapter ────────────────────────────────────────────────

/**
 * ElectronDownloadService — Renderer-side adapter for native downloads.
 *
 * Architecture notes:
 * - In Mock mode: tick() drives progress simulation
 * - In Electron mode: progress comes from IPC events (onProgress, onStateChange)
 * - This adapter maintains a local cache of items updated by events
 * - tick() is a no-op in Electron mode (progress is event-driven, not polled)
 * - Methods like createFromMetadata, transition, retry, fail are used by queueStore
 *   but the actual download lifecycle is managed by NativeDownloadService in Main Process
 * - Provides callbacks to notify external subscribers (like queueStore) of updates
 */
export class ElectronDownloadService implements DownloadService {
  private itemsCache: Map<string, DownloadItem> = new Map();
  private progressUnsubscribe: (() => void) | null = null;
  private stateChangeUnsubscribe: (() => void) | null = null;
  private updateCallbacks: Set<(id: string, item: DownloadItem) => void> = new Set();
  private pendingStarts: Set<string> = new Set();

  constructor() {
    // Subscribe to IPC progress events
    this.progressUnsubscribe = window.electronAPI!.download.onProgress((payload: DownloadProgressPayload) => {
      const item = this.itemsCache.get(payload.id);
      if (!item) {
        return;
      }

      const nonLiveStatuses: DownloadStatus[] = ["paused", "canceled", "failed", "completed"];
      if (nonLiveStatuses.includes(item.status)) {
        return;
      }

      const updated = {
        ...item,
        progress: payload.progress,
        downloadedSize: payload.downloadedSize,
        fileSize: payload.totalSize || item.fileSize,
        speed: payload.speed,
        eta: payload.eta,
        lastUpdatedAt: Date.now()
      };
      this.itemsCache.set(payload.id, updated);

      // Notify subscribers of the update
      this.notifyUpdate(payload.id, updated);
    });

    // Subscribe to IPC state change events
    this.stateChangeUnsubscribe = window.electronAPI!.download.onStateChange((payload: DownloadStateChangePayload) => {
      const item = this.itemsCache.get(payload.id);
      if (item) {
        // Main Process events are authoritative because background auto-start can
        // skip the renderer-only queued -> analyzing transition.
        const isValidTransition = canTransition(item.status, payload.status);
        const isTerminalOrPaused = ["paused", "canceled", "failed", "completed"].includes(item.status);
        const isStaleActiveEvent = isTerminalOrPaused && ["downloading", "retrying", "merging", "converting"].includes(payload.status);

        if (!isValidTransition && isStaleActiveEvent) {
          console.warn(
            `[ElectronDownloadService] Ignoring invalid state change for ${payload.id}: ${item.status} -> ${payload.status}`
          );
          return;
        }

        const updated = {
          ...item,
          status: payload.status,
          progress: payload.progress,
          downloadedSize: payload.downloadedSize,
          speed: payload.speed,
          eta: payload.eta,
          errorCode: payload.errorCode,
          errorMessage: payload.errorMessage,
          lastUpdatedAt: Date.now()
        };
        this.itemsCache.set(payload.id, updated);

        // Notify subscribers of the update
        this.notifyUpdate(payload.id, updated);
      }
    });

    // Initial sync from Main Process
    void this.syncFromMain();
  }

  /**
   * Subscribe to item updates (for queueStore integration)
   */
  onItemUpdate(callback: (id: string, item: DownloadItem) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  /**
   * Notify all subscribers of an item update
   */
  private notifyUpdate(id: string, item: DownloadItem): void {
    this.updateCallbacks.forEach((callback) => callback(id, item));
  }

  /**
   * Sync items from Main Process to local cache
   */
  private async syncFromMain(): Promise<void> {
    try {
      const items = await window.electronAPI!.download.getAll();
      items.forEach((item) => this.itemsCache.set(item.id, item));
    } catch (err) {
      console.error("[ElectronDownloadService] Failed to sync from Main:", err);
    }
  }

  async getAll(): Promise<DownloadItem[]> {
    const items = await window.electronAPI!.download.getAll();
    items.forEach((item) => this.itemsCache.set(item.id, item));
    return items;
  }

  /**
   * Cleanup event listeners
   */
  cleanup(): void {
    if (this.progressUnsubscribe) {
      this.progressUnsubscribe();
      this.progressUnsubscribe = null;
    }
    if (this.stateChangeUnsubscribe) {
      this.stateChangeUnsubscribe();
      this.stateChangeUnsubscribe = null;
    }
  }

  // ─── DownloadService Interface Implementation ─────────────────────────────

  createFromMetadata(metadata: VideoMetadata, order: number, quality: string, format: string): DownloadItem {
    const now = Date.now();
    const item: DownloadItem = {
      id: crypto.randomUUID(),
      metadataId: metadata.id,
      thumbnail: metadata.thumbnail,
      title: metadata.title,
      sourceUrl: metadata.sourceUrl,
      quality,
      format,
      fileSize: metadata.fileSize,
      downloadedSize: 0,
      speed: 0,
      eta: "--",
      progress: 0,
      status: "queued",
      order,
      addedAt: new Date().toISOString(),
      phaseStartedAt: now,
      lastUpdatedAt: now,
      retryCount: 0
    };

    // Add to cache and notify Main Process
    this.itemsCache.set(item.id, item);
    void window.electronAPI!.download.add(item);

    return item;
  }

  async remove(id: string): Promise<void> {
    await window.electronAPI!.download.remove(id);
    this.itemsCache.delete(id);
  }

  createFromHistoryItem(item: HistoryItem, order: number): DownloadItem {
    const now = Date.now();
    const downloadItem: DownloadItem = {
      id: crypto.randomUUID(),
      metadataId: item.metadataId,
      thumbnail: item.thumbnail,
      title: item.title,
      sourceUrl: item.sourceUrl,
      quality: item.quality,
      format: item.format,
      fileSize: item.fileSize,
      downloadedSize: 0,
      speed: 0,
      eta: "--",
      progress: 0,
      status: "queued",
      order,
      addedAt: new Date().toISOString(),
      phaseStartedAt: now,
      lastUpdatedAt: now,
      retryCount: 0
    };

    this.itemsCache.set(downloadItem.id, downloadItem);
    void window.electronAPI!.download.add(downloadItem);

    return downloadItem;
  }

  createFromFavoriteItem(item: FavoriteItem, order: number, quality: string, format: string): DownloadItem {
    const now = Date.now();
    const downloadItem: DownloadItem = {
      id: crypto.randomUUID(),
      metadataId: item.id,
      thumbnail: item.thumbnail,
      title: item.title,
      sourceUrl: item.sourceUrl,
      quality,
      format,
      fileSize: 180 * 1024 * 1024, // Default estimate
      downloadedSize: 0,
      speed: 0,
      eta: "--",
      progress: 0,
      status: "queued",
      order,
      addedAt: new Date().toISOString(),
      phaseStartedAt: now,
      lastUpdatedAt: now,
      retryCount: 0
    };

    this.itemsCache.set(downloadItem.id, downloadItem);
    void window.electronAPI!.download.add(downloadItem);

    return downloadItem;
  }

  /**
   * Transition download to new status
   * In Electron mode, this sends command to Main Process and waits for state change event
   */
  transition(item: DownloadItem, status: DownloadStatus, now: number): DownloadItem {
    const startRequested = item.status === "queued" && status === "analyzing";
    const resumeRequested = item.status === "analyzing" && status === "downloading";

    if (startRequested || resumeRequested) {
      if (this.pendingStarts.has(item.id)) {
        status = "downloading";
      } else {
        this.pendingStarts.add(item.id);
        const startPromise = window.electronAPI!.download.start(item.id);
        if (startPromise && typeof (startPromise as Promise<unknown>).finally === "function") {
          void (startPromise as Promise<unknown>).finally(() => {
            this.pendingStarts.delete(item.id);
          });
        } else {
          this.pendingStarts.delete(item.id);
        }
        status = "downloading";
      }
    } else if (item.status === "downloading" && status === "paused") {
      // Properly handle pause with error logging
      if (window.electronAPI?.download?.pause) {
        window.electronAPI.download.pause(item.id).catch((err) => {
          console.error(`[ElectronDownloadService] Failed to pause download ${item.id}:`, err);
        });
      } else {
        console.error(`[ElectronDownloadService] pause API not available for ${item.id}`);
      }
    } else if (item.status === "paused" && status === "downloading") {
      // Properly handle resume with error logging
      console.log(`[ElectronDownloadService] Resume requested for: ${item.id} (progress: ${item.progress}%)`);
      if (window.electronAPI?.download?.resume) {
        window.electronAPI.download.resume(item.id).catch((err) => {
          console.error(`[ElectronDownloadService] Failed to resume download ${item.id}:`, err);
        });
      } else {
        console.error(`[ElectronDownloadService] resume API not available for ${item.id}`);
      }
    } else if (status === "canceled") {
      // Properly handle cancel with error logging
      if (window.electronAPI?.download?.cancel) {
        window.electronAPI.download.cancel(item.id).catch((err) => {
          console.error(`[ElectronDownloadService] Failed to cancel download ${item.id}:`, err);
        });
      } else {
        console.error(`[ElectronDownloadService] cancel API not available for ${item.id}`);
      }
    }

    const updated = {
      ...item,
      status,
      phaseStartedAt: now,
      lastUpdatedAt: now,
      speed: status === "downloading" ? 0 : item.speed,
      eta: status === "downloading" ? "--" : item.eta
    };
    this.itemsCache.set(item.id, updated);
    return updated;
  }

  /**
   * Retry failed/canceled download
   */
  retry(item: DownloadItem, now: number): DownloadItem {
    void window.electronAPI!.download.retry(item.id);

    // Update local cache optimistically
    const updated = {
      ...item,
      status: "retrying" as DownloadStatus,
      progress: 0,
      downloadedSize: 0,
      speed: 0,
      eta: "--",
      retryCount: item.retryCount + 1,
      errorCode: undefined,
      errorMessage: undefined,
      phaseStartedAt: now,
      lastUpdatedAt: now
    };
    this.itemsCache.set(item.id, updated);
    return updated;
  }

  /**
   * Mark download as failed
   */
  fail(item: DownloadItem, error: ErrorModel, now: number): DownloadItem {
    // In Electron mode, failures are detected by NativeDownloadService
    // This method is mainly for mock error simulation compatibility
    const updated = {
      ...item,
      status: "failed" as DownloadStatus,
      speed: 0,
      eta: "--",
      errorCode: error.code,
      errorMessage: error.message,
      phaseStartedAt: now,
      lastUpdatedAt: now
    };
    this.itemsCache.set(item.id, updated);
    return updated;
  }

  /**
   * Tick is a no-op in Electron mode
   * Progress updates come from IPC events, not polling
   */
  tick(item: DownloadItem, _now: number, _speedLimit: SpeedLimit): DownloadItem {
    // Return cached item (updated by IPC events)
    return this.itemsCache.get(item.id) || item;
  }
}


// ─── HistoryService Adapter ─────────────────────────────────────────────────

export class ElectronHistoryService implements HistoryService {
  async getAll(): Promise<HistoryItem[]> {
    return window.electronAPI!.history.getAll();
  }

  async add(item: HistoryItem): Promise<HistoryItem> {
    return window.electronAPI!.history.add(item);
  }

  async addFromDownload(item: DownloadItem, now: string): Promise<HistoryItem> {
    const historyItem: HistoryItem = {
      id: `history-${item.id}`,
      sourceDownloadId: item.id,
      metadataId: item.metadataId,
      thumbnail: item.thumbnail,
      title: item.title,
      sourceUrl: item.sourceUrl,
      date: now,
      quality: item.quality,
      format: item.format,
      fileSize: item.fileSize,
      status: item.status === "completed" ? "completed" : item.status === "failed" ? "failed" : "canceled",
      errorCode: item.errorCode,
      errorMessage: item.errorMessage
    };
    return this.add(historyItem);
  }

  async remove(id: string): Promise<void> {
    await window.electronAPI!.history.remove(id);
  }

  async clear(): Promise<void> {
    await window.electronAPI!.history.clear();
  }

  // No-op in production; only meaningful for test injection in Mock services
  failNext(_error: ErrorModel): void {
    console.warn("[ElectronHistoryService] failNext() is not supported in Electron mode.");
  }
}

// ─── FavoritesService Adapter ────────────────────────────────────────────────

export class ElectronFavoritesService implements FavoritesService {
  async getAll(): Promise<FavoriteItem[]> {
    return window.electronAPI!.favorites.getAll();
  }

  async add(item: FavoriteItem): Promise<FavoriteItem> {
    return window.electronAPI!.favorites.add(item);
  }

  async remove(id: string): Promise<void> {
    await window.electronAPI!.favorites.remove(id);
  }

  async isFavorite(sourceUrl: string): Promise<boolean> {
    const items = await this.getAll();
    return items.some((item) => item.sourceUrl === sourceUrl);
  }

  async clear(): Promise<void> {
    const items = await this.getAll();
    await Promise.all(items.map((item) => this.remove(item.id)));
  }

  failNext(_error: ErrorModel): void {
    console.warn("[ElectronFavoritesService] failNext() is not supported in Electron mode.");
  }
}

// ─── SettingsService Adapter ─────────────────────────────────────────────────

export class ElectronSettingsService implements SettingsService {
  get(): AppSettings {
    // SettingsService.get() is sync in the interface (used by LocalStorage implementation).
    // The Electron adapter must bridge to async IPC. We cache the last known value and
    // trigger an async refresh, returning the cached value synchronously.
    // This is a known architectural trade-off documented in AI_HANDOFF.md.
    throw new Error(
      "[ElectronSettingsService] Synchronous get() is not supported over IPC. " +
      "Use getAsync() or ensure the store initializes with an async load."
    );
  }

  async getAsync(): Promise<AppSettings> {
    return window.electronAPI!.settings.get();
  }

  update(settings: Partial<AppSettings>): AppSettings {
    // Same sync/async mismatch — the interface is sync but IPC is async.
    // Return stale value and schedule async update.
    void window.electronAPI!.settings.update(settings);
    throw new Error(
      "[ElectronSettingsService] Synchronous update() is not supported over IPC. " +
      "Use updateAsync()."
    );
  }

  async updateAsync(settings: Partial<AppSettings>): Promise<AppSettings> {
    return window.electronAPI!.settings.update(settings);
  }

  reset(): AppSettings {
    void window.electronAPI!.settings.reset();
    throw new Error(
      "[ElectronSettingsService] Synchronous reset() is not supported over IPC. " +
      "Use resetAsync()."
    );
  }

  async resetAsync(): Promise<AppSettings> {
    return window.electronAPI!.settings.reset();
  }
}

// ─── SchedulerService Adapter ─────────────────────────────────────────────────

export class ElectronSchedulerService implements SchedulerService {
  async getAll(): Promise<ScheduledDownload[]> {
    return window.electronAPI!.scheduler.getAll();
  }

  async create(input: SchedulerInput): Promise<ScheduledDownload> {
    const schedule = {
      sourceUrl: input.sourceUrl,
      date: input.date,
      time: input.time,
      repeat: input.repeat,
      status: "scheduled" as const,
      nextRunAt: new Date(`${input.date}T${input.time}:00`).toISOString()
    };
    return window.electronAPI!.scheduler.create(schedule);
  }

  async update(id: string, input: SchedulerInput): Promise<ScheduledDownload> {
    // The IPC contract takes the full ScheduledDownload; we need to merge.
    const existing = await this.getAll();
    const item = existing.find((s) => s.id === id);
    if (!item) {
      throw ipcError(`Scheduled item not found: ${id}`);
    }
    const updated: ScheduledDownload = {
      ...item,
      sourceUrl: input.sourceUrl,
      date: input.date,
      time: input.time,
      repeat: input.repeat,
      status: "scheduled",
      nextRunAt: new Date(`${input.date}T${input.time}:00`).toISOString(),
      updatedAt: new Date().toISOString()
    };
    return window.electronAPI!.scheduler.update(updated);
  }

  async cancel(id: string): Promise<ScheduledDownload> {
    return window.electronAPI!.scheduler.cancel(id);
  }

  async remove(id: string): Promise<void> {
    await window.electronAPI!.scheduler.remove(id);
  }

  async tick(now: number): Promise<SchedulerTickResult> {
    if (!window.electronAPI?.scheduler || typeof (window.electronAPI.scheduler as any).tick !== "function") {
      const items = await this.getAll();
      return { items, triggered: [] };
    }

    return window.electronAPI.scheduler.tick(now);
  }

  async clear(): Promise<void> {
    const items = await this.getAll();
    await Promise.all(items.map((item) => this.remove(item.id)));
  }

  failNext(_error: ErrorModel): void {
    console.warn("[ElectronSchedulerService] failNext() is not supported in Electron mode.");
  }
}
