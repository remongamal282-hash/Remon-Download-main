/**
 * Service Resolver — Dual-mode factory.
 *
 * Returns Electron IPC Adapter implementations when running inside Electron
 * (window.electronAPI is defined by preload.ts via contextBridge).
 *
 * Returns Mock/Local Service implementations when running in:
 * - Web browser (npm run dev)
 * - Vitest (npm run test)
 *
 * No component or Zustand store should import service classes directly.
 * They must use these resolver functions instead so the correct implementation
 * is chosen at runtime.
 *
 * NOTE on SettingsService:
 * The SettingsService interface is synchronous (get/update/reset).
 * LocalStorageSettingsService satisfies this interface for Web/Vitest mode.
 * ElectronSettingsService throws on sync calls (IPC is async by nature).
 * Until the sync/async mismatch is resolved (see AI_HANDOFF.md), the settings
 * resolver always returns LocalStorageSettingsService regardless of environment.
 * This is the documented architectural trade-off for Phase 2 Foundation.
 *
 * NOTE on DownloadService:
 * In Mock mode: tick() drives progress simulation.
 * In Electron mode: progress comes from IPC events (onProgress, onStateChange).
 * ElectronDownloadService maintains a local cache updated by events.
 */

import { MockMetadataService } from "./metadataService";
import { MockDownloadService } from "./downloadService";
import { MockHistoryService } from "./historyService";
import { MockFavoritesService } from "./favoritesService";
import { MockSchedulerService } from "./schedulerService";
import { LocalStorageSettingsService } from "./settingsService";
import {
  ElectronMetadataService,
  ElectronDownloadService,
  ElectronHistoryService,
  ElectronFavoritesService,
  ElectronSchedulerService,
  ElectronSettingsService
} from "./electronIpcAdapters";
import type { MetadataService } from "./metadataService";
import type { DownloadService } from "./downloadService";
import type { HistoryService } from "./historyService";
import type { FavoritesService } from "./favoritesService";
import type { SchedulerService } from "./schedulerService";
import type { SettingsService } from "./settingsService";

// ─── Environment Detection ─────────────────────────────────────────────────

/**
 * Returns true when the renderer is running inside Electron and the preload
 * has successfully exposed window.electronAPI via contextBridge.
 */
export function isElectronEnvironment(): boolean {
  return typeof window !== "undefined" && typeof window.electronAPI !== "undefined";
}

// ─── Singleton cache ───────────────────────────────────────────────────────
// Lazy singletons — one instance per runtime lifetime.

let _metadataService: MetadataService | null = null;
let _downloadService: DownloadService | null = null;
let _historyService: HistoryService | null = null;
let _favoritesService: FavoritesService | null = null;
let _schedulerService: SchedulerService | null = null;
let _settingsService: SettingsService | null = null;

// ─── Resolver functions ────────────────────────────────────────────────────

export function resolveMetadataService(): MetadataService {
  if (!_metadataService) {
    _metadataService = isElectronEnvironment()
      ? new ElectronMetadataService()
      : new MockMetadataService();
  }
  return _metadataService;
}

/**
 * DownloadService resolver.
 * In Electron mode: uses ElectronDownloadService with IPC event-driven progress.
 * In Web/Vitest mode: uses MockDownloadService with tick-based simulation.
 */
export function resolveDownloadService(): DownloadService {
  if (!_downloadService) {
    _downloadService = isElectronEnvironment()
      ? new ElectronDownloadService()
      : new MockDownloadService();
  }
  return _downloadService;
}

export function resolveHistoryService(): HistoryService {
  if (!_historyService) {
    _historyService = isElectronEnvironment()
      ? new ElectronHistoryService()
      : new MockHistoryService();
  }
  return _historyService;
}

export function resolveFavoritesService(): FavoritesService {
  if (!_favoritesService) {
    _favoritesService = isElectronEnvironment()
      ? new ElectronFavoritesService()
      : new MockFavoritesService();
  }
  return _favoritesService;
}

export function resolveSchedulerService(): SchedulerService {
  if (!_schedulerService) {
    _schedulerService = isElectronEnvironment()
      ? new ElectronSchedulerService()
      : new MockSchedulerService();
  }
  return _schedulerService;
}

/**
 * SettingsService resolver.
 *
 * Phase 3.1 Update: Now returns ElectronSettingsService in Electron mode.
 * settingsStore has been updated to handle async operations.
 */
export function resolveSettingsService(): SettingsService {
  if (!_settingsService) {
    _settingsService = isElectronEnvironment()
      ? new ElectronSettingsService()
      : new LocalStorageSettingsService();
  }
  return _settingsService;
}

// ─── Test utilities ────────────────────────────────────────────────────────

/**
 * Reset all cached service singletons.
 * USE ONLY IN TESTS — allows injecting fresh mocks between test cases.
 */
export function _resetServiceCache(): void {
  _metadataService = null;
  _downloadService = null;
  _historyService = null;
  _favoritesService = null;
  _schedulerService = null;
  _settingsService = null;
}

/**
 * Override cached service instances.
 * USE ONLY IN TESTS — allows injecting controlled mocks.
 */
export function _injectMetadataService(s: MetadataService): void { _metadataService = s; }
export function _injectDownloadService(s: DownloadService): void { _downloadService = s; }
export function _injectHistoryService(s: HistoryService): void { _historyService = s; }
export function _injectFavoritesService(s: FavoritesService): void { _favoritesService = s; }
export function _injectSchedulerService(s: SchedulerService): void { _schedulerService = s; }
export function _injectSettingsService(s: SettingsService): void { _settingsService = s; }
