import { beforeEach, describe, expect, it } from "vitest";
import type { DownloadItem } from "../types/download";
import { useQueueStore } from "./queueStore";
import { useHistoryStore } from "./historyStore";

const baseDownload: DownloadItem = {
  id: "download-1",
  metadataId: "video-1",
  thumbnail: "https://example.com/thumb.jpg",
  title: "History Store Video",
  sourceUrl: "https://www.youtube.com/watch?v=store",
  quality: "720p",
  format: "webm",
  fileSize: 4096,
  downloadedSize: 4096,
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

describe("useHistoryStore", () => {
  beforeEach(async () => {
    await useHistoryStore.getState().clear();
    useHistoryStore.getState().clearError();
    useQueueStore.getState().clear();
  });

  it("loads history items from the service", async () => {
    await useHistoryStore.getState().addFromDownload(baseDownload, "2026-08-14T08:10:00.000Z");
    useHistoryStore.setState({ items: [] });

    await useHistoryStore.getState().load();

    expect(useHistoryStore.getState().items).toHaveLength(1);
    expect(useHistoryStore.getState().isLoading).toBe(false);
  });

  it("adds completed, failed, and canceled downloads", async () => {
    await useHistoryStore.getState().addFromDownload(baseDownload, "2026-08-14T08:10:00.000Z");
    await useHistoryStore.getState().addFromDownload(
      { ...baseDownload, id: "download-2", status: "failed", errorCode: "disk_full", errorMessage: "errors.diskFull" },
      "2026-08-14T08:11:00.000Z"
    );
    await useHistoryStore.getState().addFromDownload(
      { ...baseDownload, id: "download-3", status: "canceled" },
      "2026-08-14T08:12:00.000Z"
    );

    expect(useHistoryStore.getState().items.map((item) => item.status)).toEqual([
      "canceled",
      "failed",
      "completed"
    ]);
  });

  it("removes and clears history items", async () => {
    const item = await useHistoryStore.getState().addFromDownload(baseDownload, "2026-08-14T08:10:00.000Z");

    await useHistoryStore.getState().remove(item?.id ?? "");
    expect(useHistoryStore.getState().items).toEqual([]);

    await useHistoryStore.getState().addFromDownload(baseDownload, "2026-08-14T08:10:00.000Z");
    await useHistoryStore.getState().clear();
    expect(useHistoryStore.getState().items).toEqual([]);
  });

  it("re-downloads a history item into the queue without starting it", async () => {
    const item = await useHistoryStore.getState().addFromDownload(baseDownload, "2026-08-14T08:10:00.000Z");

    const result = useHistoryStore.getState().redownload(item?.id ?? "");

    expect(result).toBe(true);
    expect(useQueueStore.getState().items).toHaveLength(1);
    expect(useQueueStore.getState().items[0]).toMatchObject({
      sourceUrl: baseDownload.sourceUrl,
      quality: baseDownload.quality,
      format: baseDownload.format,
      thumbnail: baseDownload.thumbnail,
      status: "queued"
    });
  });

  it("maps service errors into store error state", async () => {
    useHistoryStore.getState().failNext({ code: "network_error", message: "errors.networkError", recoverable: true });

    await useHistoryStore.getState().load();

    expect(useHistoryStore.getState().error).toMatchObject({ code: "network_error" });
    expect(useHistoryStore.getState().isLoading).toBe(false);
  });

  it("reports missing re-download and open-folder items", () => {
    expect(useHistoryStore.getState().redownload("missing")).toBe(false);
    expect(useHistoryStore.getState().error?.message).toBe("history.errors.notFound");

    useHistoryStore.getState().clearError();
    expect(useHistoryStore.getState().openFolder("missing")).toBe(false);
    expect(useHistoryStore.getState().error?.message).toBe("history.errors.notFound");
  });
});
