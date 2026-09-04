import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoMetadata } from "../types/download";

const metadata: VideoMetadata = {
  id: "video-1",
  sourceUrl: "https://www.youtube.com/watch?v=abc",
  linkType: "video",
  thumbnail: "https://example.com/thumb.jpg",
  title: "Test Video",
  channelName: "Test Channel",
  duration: "10:00",
  views: 100,
  qualityOptions: ["1080p"],
  videoFormats: ["mp4"],
  audioFormats: ["m4a"],
  resolution: "1080p",
  fps: 60,
  videoCodec: "H.264",
  audioCodec: "AAC",
  videoBitrate: "8 Mbps",
  audioBitrate: "192 Kbps",
  container: "mp4",
  fileSize: 1024,
  uploadDate: "2026-08-01"
};

let useQueueStore: any;

beforeEach(async () => {
  vi.resetModules();
  const serviceResolver = await import("../services/serviceResolver");
  const queueStoreModule = await import("./queueStore");
  useQueueStore = queueStoreModule.useQueueStore;
  serviceResolver._resetServiceCache();
  useQueueStore.getState().clear();
});

describe("useQueueStore", () => {
  it("propagates progress updates from the download service to the queue store", async () => {
    vi.resetModules();
    const serviceResolver = await import("../services/serviceResolver");
    let onItemUpdate: ((id: string, item: any) => void) | undefined;

    serviceResolver._injectDownloadService({
      createFromMetadata: (m: VideoMetadata, order: number, quality: string, format: string) => ({
        id: crypto.randomUUID(),
        metadataId: m.id,
        thumbnail: m.thumbnail,
        title: m.title,
        sourceUrl: m.sourceUrl,
        quality,
        format,
        fileSize: m.fileSize,
        downloadedSize: 0,
        speed: 0,
        eta: "--",
        progress: 0,
        status: "queued",
        order,
        addedAt: new Date().toISOString(),
        phaseStartedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        retryCount: 0
      }),
      createFromHistoryItem: vi.fn(),
      createFromFavoriteItem: vi.fn(),
      transition: vi.fn((item) => item),
      retry: vi.fn((item) => ({ ...item, status: "retrying", progress: 0, downloadedSize: 0, speed: 0, eta: "--" })),
      fail: vi.fn((item) => item),
      tick: vi.fn((item) => item),
      onItemUpdate: (callback: (id: string, item: any) => void) => {
        onItemUpdate = callback;
        return () => { onItemUpdate = undefined; };
      }
    } as any);

    const queueStoreModule = await import("./queueStore");
    const queueStore = queueStoreModule.useQueueStore;
    const item = queueStore.getState().addFromMetadata(metadata, "1080p", "mp4");

    const updateHandler = onItemUpdate;
    if (typeof updateHandler === "function") {
      updateHandler(item.id, { ...item, status: "downloading", progress: 42, downloadedSize: 512, speed: 1024, eta: "00:05" });
    }

    expect(queueStore.getState().items[0]?.progress).toBe(42);
    expect(queueStore.getState().items[0]?.status).toBe("downloading");
  });

  it("adds metadata to the queue without starting download", () => {
    const item = useQueueStore.getState().addFromMetadata(metadata, "1080p", "mp4");
    expect(item.status).toBe("queued");
    expect(useQueueStore.getState().items).toHaveLength(1);
  });

  it("runs a complete mocked lifecycle", () => {
    useQueueStore.getState().addFromMetadata({ ...metadata, fileSize: 1024 }, "1080p", "mp4");

    useQueueStore.getState().tick(1, "unlimited", 1000);
    expect(useQueueStore.getState().items[0]?.status).toBe("analyzing");

    useQueueStore.getState().tick(1, "unlimited", 1700);
    expect(useQueueStore.getState().items[0]?.status).toBe("downloading");

    useQueueStore.getState().tick(1, "unlimited", 2500);
    expect(useQueueStore.getState().items[0]?.status).toBe("merging");

    useQueueStore.getState().tick(1, "unlimited", 3300);
    expect(useQueueStore.getState().items[0]?.status).toBe("converting");

    useQueueStore.getState().tick(1, "unlimited", 4100);
    expect(useQueueStore.getState().items[0]?.status).toBe("completed");
  });

  it("limits concurrent active downloads", () => {
    useQueueStore.getState().addManyFromMetadata(
      [
        { ...metadata, id: "video-1" },
        { ...metadata, id: "video-2" },
        { ...metadata, id: "video-3" }
      ],
      "1080p",
      "mp4"
    );

    useQueueStore.getState().tick(2, "unlimited", 1000);
    const statuses = useQueueStore.getState().items.map((item: any) => item.status);

    expect(statuses.filter((status: any) => status === "analyzing")).toHaveLength(2);
    expect(statuses.filter((status: any) => status === "queued")).toHaveLength(1);
  });

  it("pauses, resumes, cancels, retries, and removes items", async () => {
    const item = useQueueStore.getState().addFromMetadata(metadata, "1080p", "mp4");
    useQueueStore.getState().tick(1, "unlimited", 1000);
    useQueueStore.getState().tick(1, "unlimited", 1700);

    useQueueStore.getState().pause(item.id);
    expect(useQueueStore.getState().items[0]?.status).toBe("paused");

    useQueueStore.getState().resume(item.id);
    expect(useQueueStore.getState().items[0]?.status).toBe("downloading");

    useQueueStore.getState().cancel(item.id);
    expect(useQueueStore.getState().items[0]?.status).toBe("canceled");

    useQueueStore.getState().retry(item.id);
    expect(useQueueStore.getState().items[0]?.status).toBe("retrying");

    await useQueueStore.getState().remove(item.id);
    expect(useQueueStore.getState().items).toHaveLength(0);
  });

  it("records mock error scenarios", () => {
    const item = useQueueStore.getState().addFromMetadata(metadata, "1080p", "mp4");
    useQueueStore.getState().tick(1, "unlimited", 1000);

    useQueueStore.getState().simulateError(item.id, "disk_full");

    expect(useQueueStore.getState().items[0]?.status).toBe("failed");
    expect(useQueueStore.getState().items[0]?.errorCode).toBe("disk_full");
  });

  it("reorders items and updates order values", () => {
    const [first, second] = useQueueStore.getState().addManyFromMetadata(
      [
        { ...metadata, id: "video-1", title: "First" },
        { ...metadata, id: "video-2", title: "Second" }
      ],
      "1080p",
      "mp4"
    );

    useQueueStore.getState().reorder(first.id, second.id);

    expect(useQueueStore.getState().items[0]?.title).toBe("Second");
    expect(useQueueStore.getState().items[0]?.order).toBe(1);
    expect(useQueueStore.getState().items[1]?.title).toBe("First");
    expect(useQueueStore.getState().items[1]?.order).toBe(2);
  });
});
