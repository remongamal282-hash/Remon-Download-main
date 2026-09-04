import type { DownloadItem, DownloadStatus, FavoriteItem, HistoryItem, VideoMetadata } from "../types/download";
import type { AppErrorCode, ErrorModel } from "../types/errors";
import type { SpeedLimit } from "../types/settings";
import { calculateMockSpeed, formatEta } from "../utils/downloadSimulation";
import { assertTransition } from "../utils/stateMachine";

export interface DownloadService {
  createFromMetadata(metadata: VideoMetadata, order: number, quality: string, format: string): DownloadItem;
  remove(id: string): Promise<void>;
  createFromHistoryItem(item: HistoryItem, order: number): DownloadItem;
  createFromFavoriteItem(item: FavoriteItem, order: number, quality: string, format: string): DownloadItem;
  transition(item: DownloadItem, status: DownloadStatus, now: number): DownloadItem;
  retry(item: DownloadItem, now: number): DownloadItem;
  fail(item: DownloadItem, error: ErrorModel, now: number): DownloadItem;
  tick(item: DownloadItem, now: number, speedLimit: SpeedLimit): DownloadItem;
  getAll?(): Promise<DownloadItem[]>;
  // Optional: Subscribe to item updates (for Electron mode integration)
  onItemUpdate?(callback: (id: string, item: DownloadItem) => void): () => void;
}

export class MockDownloadService implements DownloadService {
  async remove(_id: string): Promise<void> {
    // Mock downloads are owned by the renderer queue store.
  }

  createFromMetadata(metadata: VideoMetadata, order: number, quality: string, format: string): DownloadItem {
    const now = Date.now();

    return {
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
  }

  createFromHistoryItem(item: HistoryItem, order: number): DownloadItem {
    const now = Date.now();

    return {
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
  }

  createFromFavoriteItem(item: FavoriteItem, order: number, quality: string, format: string): DownloadItem {
    const now = Date.now();

    return {
      id: crypto.randomUUID(),
      metadataId: item.id,
      thumbnail: item.thumbnail,
      title: item.title,
      sourceUrl: item.sourceUrl,
      quality,
      format,
      fileSize: 180 * 1024 * 1024,
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
  }

  transition(item: DownloadItem, status: DownloadStatus, now: number): DownloadItem {
    assertTransition(item.status, status);

    return {
      ...item,
      status,
      phaseStartedAt: now,
      lastUpdatedAt: now,
      speed: status === "downloading" ? item.speed : 0,
      eta: status === "completed" || status === "canceled" || status === "failed" ? "--" : item.eta
    };
  }

  retry(item: DownloadItem, now: number): DownloadItem {
    assertTransition(item.status, "retrying");

    return {
      ...item,
      status: "retrying",
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
  }

  fail(item: DownloadItem, error: ErrorModel, now: number): DownloadItem {
    assertTransition(item.status, "failed");

    return {
      ...item,
      status: "failed",
      speed: 0,
      eta: "--",
      errorCode: error.code,
      errorMessage: error.message,
      phaseStartedAt: now,
      lastUpdatedAt: now
    };
  }

  tick(item: DownloadItem, now: number, speedLimit: SpeedLimit): DownloadItem {
    if (item.status === "analyzing" && now - item.phaseStartedAt >= 650) {
      return this.transition(item, "downloading", now);
    }

    if (item.status === "retrying" && now - item.phaseStartedAt >= 300) {
      return this.transition(item, "analyzing", now);
    }

    if (item.status === "merging" && now - item.phaseStartedAt >= 700) {
      return this.transition(item, "converting", now);
    }

    if (item.status === "converting" && now - item.phaseStartedAt >= 700) {
      return {
        ...this.transition(item, "completed", now),
        progress: 100,
        downloadedSize: item.fileSize,
        speed: 0,
        eta: "--"
      };
    }

    if (item.status !== "downloading") {
      return item;
    }

    const elapsedSeconds = Math.max(0.25, (now - item.lastUpdatedAt) / 1000);
    const tickIndex = Math.floor((now - item.phaseStartedAt) / 350);
    const baseSpeed = Math.max(300 * 1024, item.fileSize / 18);
    const speed = calculateMockSpeed(baseSpeed, speedLimit, tickIndex);
    const downloadedSize = Math.min(item.fileSize, item.downloadedSize + speed * elapsedSeconds);
    const progress = Math.min(100, (downloadedSize / item.fileSize) * 100);

    if (progress >= 100) {
      return {
        ...this.transition(item, "merging", now),
        downloadedSize: item.fileSize,
        progress: 100,
        speed: 0,
        eta: "--"
      };
    }

    return {
      ...item,
      downloadedSize,
      progress,
      speed,
      eta: formatEta((item.fileSize - downloadedSize) / speed),
      lastUpdatedAt: now
    };
  }
}

export const downloadService: DownloadService = new MockDownloadService();
