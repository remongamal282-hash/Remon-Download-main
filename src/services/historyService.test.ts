import { describe, expect, it } from "vitest";
import { MockHistoryService } from "./historyService";
import type { DownloadItem, HistoryItem } from "../types/download";

const baseDownload: DownloadItem = {
  id: "download-1",
  metadataId: "video-1",
  thumbnail: "https://example.com/thumb.jpg",
  title: "History Test Video",
  sourceUrl: "https://www.youtube.com/watch?v=history",
  quality: "1080p",
  format: "mp4",
  fileSize: 2048,
  downloadedSize: 2048,
  speed: 0,
  eta: "--",
  progress: 100,
  status: "completed",
  order: 1,
  addedAt: "2026-08-14T08:00:00.000Z",
  phaseStartedAt: 0,
  lastUpdatedAt: 0,
  retryCount: 0
};

const baseHistoryItem: HistoryItem = {
  id: "history-1",
  sourceDownloadId: "download-1",
  metadataId: "video-1",
  thumbnail: "https://example.com/thumb.jpg",
  title: "History Test Video",
  sourceUrl: "https://www.youtube.com/watch?v=history",
  date: "2026-08-14T08:10:00.000Z",
  quality: "1080p",
  format: "mp4",
  fileSize: 2048,
  status: "completed"
};

describe("MockHistoryService", () => {
  it("adds and returns history items", async () => {
    const service = new MockHistoryService();

    await service.add(baseHistoryItem);

    expect(await service.getAll()).toEqual([baseHistoryItem]);
  });

  it("creates completed, failed, and canceled history items from downloads", async () => {
    const service = new MockHistoryService();

    const completed = await service.addFromDownload(baseDownload, baseHistoryItem.date);
    const failed = await service.addFromDownload(
      { ...baseDownload, id: "download-2", status: "failed", errorCode: "network_error", errorMessage: "errors.networkError" },
      baseHistoryItem.date
    );
    const canceled = await service.addFromDownload(
      { ...baseDownload, id: "download-3", status: "canceled" },
      baseHistoryItem.date
    );

    expect(completed.status).toBe("completed");
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("network_error");
    expect(canceled.status).toBe("canceled");
  });

  it("removes and clears history items", async () => {
    const service = new MockHistoryService();

    await service.add(baseHistoryItem);
    await service.remove(baseHistoryItem.id);
    expect(await service.getAll()).toEqual([]);

    await service.add(baseHistoryItem);
    await service.clear();
    expect(await service.getAll()).toEqual([]);
  });

  it("supports one-shot mock errors", async () => {
    const service = new MockHistoryService();
    service.failNext({ code: "network_error", message: "errors.networkError", recoverable: true });

    await expect(service.getAll()).rejects.toMatchObject({ code: "network_error" });
    await expect(service.getAll()).resolves.toEqual([]);
  });
});
