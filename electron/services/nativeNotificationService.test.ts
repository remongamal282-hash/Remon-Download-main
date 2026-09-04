import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadItem, ScheduledDownload, VideoMetadata } from "../../src/types/download";
import type { AppSettings } from "../../src/types/settings";
import { NativeNotificationService } from "./nativeNotificationService";

const { notificationInstances, notificationConstructor } = vi.hoisted(() => {
  const instances: Array<{ options: unknown; show: ReturnType<typeof vi.fn> }> = [];
  const constructor = Object.assign(
    vi.fn((options: unknown) => {
      const instance = { options, show: vi.fn() };
      instances.push(instance);
      return instance;
    }),
    { isSupported: vi.fn(() => true) }
  );

  return { notificationInstances: instances, notificationConstructor: constructor };
});

const { nativeImageMock } = vi.hoisted(() => ({
  nativeImageMock: {
    createFromBuffer: vi.fn(() => ({ source: "thumbnail", isEmpty: vi.fn(() => false) })),
    createFromPath: vi.fn((filePath: string) => ({ filePath, isEmpty: vi.fn(() => false) }))
  }
}));

vi.mock("electron", () => ({
  Notification: notificationConstructor,
  nativeImage: nativeImageMock,
  BrowserWindow: {
    getAllWindows: vi.fn(() => [{
      isVisible: vi.fn(() => true),
      isMinimized: vi.fn(() => false),
      webContents: { send: vi.fn() }
    }])
  },
  app: {
    getPath: vi.fn(() => process.env.TEMP ?? "."),
    getAppPath: vi.fn(() => process.cwd())
  }
}));

function createSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    downloadFolder: "~/Downloads",
    startWithWindows: false,
    minimizeToTray: false,
    appearance: "system",
    language: "en",
    concurrentDownloads: 3,
    speedLimit: "unlimited",
    defaultQuality: "720p",
    defaultVideoFormat: "mp4",
    defaultAudioFormat: "mp3",
    enableNotifications: true,
    notificationWhenCompleted: true,
    notificationWhenFailed: true,
    clipboardMonitoring: false,
    askBeforeDownloading: true,
    fileNameTemplate: "%(title)s.%(ext)s",
    ytdlpPath: "",
    ffmpegPath: "",
    proxy: "",
    ...overrides
  };
}

function createItem(overrides?: Partial<DownloadItem>): DownloadItem {
  return {
    id: "download-1",
    metadataId: "metadata-1",
    thumbnail: "",
    title: "Example Video",
    sourceUrl: "https://www.youtube.com/watch?v=example",
    quality: "720p",
    format: "mp4",
    fileSize: 100,
    downloadedSize: 100,
    speed: 0,
    eta: "--",
    progress: 100,
    status: "completed",
    order: 1,
    addedAt: new Date().toISOString(),
    phaseStartedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    retryCount: 0,
    ...overrides
  };
}

function createSchedule(overrides?: Partial<ScheduledDownload>): ScheduledDownload {
  return {
    id: "schedule-1",
    sourceUrl: "https://www.youtube.com/watch?v=example",
    date: "2026-08-19",
    time: "12:00",
    repeat: "once",
    status: "triggered",
    nextRunAt: "2026-08-19T12:00:00.000Z",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    triggerCount: 1,
    ...overrides
  };
}

describe("NativeNotificationService", () => {
  beforeEach(() => {
    notificationInstances.length = 0;
    notificationConstructor.mockClear();
    notificationConstructor.isSupported.mockReturnValue(true);
    nativeImageMock.createFromPath.mockClear();
  });

  it("does not notify when notifications are disabled", () => {
    const service = new NativeNotificationService(createSettings({ enableNotifications: false }));

    service.handleDownloadStateChange(
      { id: "download-1", status: "completed", progress: 100, downloadedSize: 100, fileSize: 100, speed: 0, eta: "--" },
      createItem()
    );

    expect(notificationConstructor).not.toHaveBeenCalled();
  });

  it("respects completed and failed notification settings", () => {
    const service = new NativeNotificationService(createSettings({ notificationWhenCompleted: false }));
    const completed = { id: "download-1", status: "completed" as const, progress: 100, downloadedSize: 100, fileSize: 100, speed: 0, eta: "--" };
    const failed = { id: "download-2", status: "failed" as const, progress: 10, downloadedSize: 10, fileSize: 100, speed: 0, eta: "--", errorMessage: "Network error" };

    service.handleDownloadStateChange(completed, createItem());
    service.handleDownloadStateChange(failed, createItem({ id: "download-2", status: "failed" }));

    expect(notificationConstructor).toHaveBeenCalledTimes(1);
    expect(notificationInstances[0]?.options).toMatchObject({ title: "Example Video", body: "Network error" });
  });

  it("notifies for completed and failed downloads with fallbacks", () => {
    const service = new NativeNotificationService(createSettings());

    service.handleDownloadStateChange(
      { id: "download-1", status: "completed", progress: 100, downloadedSize: 100, fileSize: 100, speed: 0, eta: "--" },
      createItem({ title: "", sourceUrl: "https://example.com/video" })
    );
    service.handleDownloadStateChange(
      { id: "download-2", status: "failed", progress: 0, downloadedSize: 0, fileSize: 100, speed: 0, eta: "--" },
      createItem({ id: "download-2", title: "Failed Video", status: "failed", sourceUrl: "https://example.com/video" })
    );

    expect(notificationInstances.map((instance) => instance.options)).toEqual([
      expect.objectContaining({ title: "Remon Download", body: "Download completed successfully", icon: expect.anything() }),
      expect.objectContaining({ title: "Failed Video", body: "Download failed", icon: expect.anything() })
    ]);
  });

  it("localizes completion and scheduled notifications in Arabic", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" }
    })));
    const service = new NativeNotificationService(createSettings({ language: "ar" }));

    service.handleDownloadStateChange(
      { id: "download-ar", status: "completed", progress: 100, downloadedSize: 100, fileSize: 100, speed: 0, eta: "--" },
      createItem({ id: "download-ar", thumbnail: "https://example.com/ar-thumbnail.jpg" })
    );
    await vi.waitFor(() => expect(nativeImageMock.createFromBuffer).toHaveBeenCalled());
    service.notifyScheduledDownload(createSchedule({ id: "schedule-ar" }));

    await vi.waitFor(() => expect(notificationConstructor).toHaveBeenCalledTimes(1));
    const bodies = notificationInstances.map((instance) => (instance.options as { body: string }).body);
    expect(bodies).toContain("تمت إضافة التحميل المجدول إلى قائمة التنزيلات");
    vi.unstubAllGlobals();
  });

  it("keeps notification messages in English for English settings", () => {
    const service = new NativeNotificationService(createSettings({ language: "en" }));

    service.handleDownloadStateChange(
      { id: "download-en", status: "failed", progress: 0, downloadedSize: 0, fileSize: 100, speed: 0, eta: "--" },
      createItem({ id: "download-en", status: "failed" })
    );

    expect(notificationInstances[0]?.options).toMatchObject({ body: "Download failed" });
  });

  it("uses a clear English message instead of exposing the exit code", () => {
    const service = new NativeNotificationService(createSettings({ language: "en" }));

    service.handleDownloadStateChange(
      {
        id: "download-english-exit-code",
        status: "failed",
        progress: 0,
        downloadedSize: 0,
        fileSize: 100,
        speed: 0,
        eta: "--",
        errorMessage: "Download failed with exit code 1"
      },
      createItem({ id: "download-english-exit-code", status: "failed" })
    );

    expect(notificationInstances[0]?.options).toMatchObject({
      body: "Download failed during processing"
    });
  });

  it("localizes an exit-code failure in Arabic", () => {
    const service = new NativeNotificationService(createSettings({ language: "ar" }));

    service.handleDownloadStateChange(
      {
        id: "download-exit-code",
        status: "failed",
        progress: 0,
        downloadedSize: 0,
        fileSize: 100,
        speed: 0,
        eta: "--",
        errorCode: "ytdlp_error",
        errorMessage: "Download failed with exit code 1"
      },
      createItem({ id: "download-exit-code", status: "failed" })
    );

    expect(notificationInstances[0]?.options).toMatchObject({
      body: "تعذر تحميل الفيديو بسبب خطأ أثناء المعالجة"
    });
  });

  it("localizes an English fallback network message in Arabic", () => {
    const service = new NativeNotificationService(createSettings({ language: "ar" }));

    service.handleDownloadStateChange(
      {
        id: "download-network-fallback",
        status: "failed",
        progress: 0,
        downloadedSize: 0,
        fileSize: 100,
        speed: 0,
        eta: "--",
        errorMessage: "Network error"
      },
      createItem({ id: "download-network-fallback", status: "failed" })
    );

    expect(notificationInstances[0]?.options).toMatchObject({
      body: "فشل تحميل الفيديو بسبب خطأ في الشبكة"
    });
  });

  it("uses the video thumbnail when it is available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" }
    })));
    const service = new NativeNotificationService(createSettings());

    service.handleDownloadStateChange(
      { id: "download-thumbnail", status: "completed", progress: 100, downloadedSize: 100, fileSize: 100, speed: 0, eta: "--" },
      createItem({ id: "download-thumbnail", thumbnail: "https://example.com/thumbnail.jpg" })
    );

    await vi.waitFor(() => expect(nativeImageMock.createFromBuffer).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it("uses one scheduled playlist notification for the playlist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" }
    })));
    const service = new NativeNotificationService(createSettings());
    const schedule = createSchedule({ id: "schedule-playlist", triggerCount: 1 });

    service.notifyScheduledDownload(schedule, {
      ...createItem(),
      id: "playlist-video-1",
      title: "First Playlist Video",
      thumbnail: "https://example.com/first.jpg"
    } as unknown as VideoMetadata);
    service.notifyScheduledDownload(schedule, {
      ...createItem(),
      id: "playlist-video-2",
      title: "Second Playlist Video",
      thumbnail: "https://example.com/second.jpg"
    } as unknown as VideoMetadata);

    await vi.waitFor(() => expect(nativeImageMock.createFromBuffer).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it("uses the YouTube thumbnail fallback for playlist videos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" }
    })));
    const service = new NativeNotificationService(createSettings());

    service.handleDownloadStateChange(
      { id: "playlist-download-2", status: "completed", progress: 100, downloadedSize: 100, fileSize: 100, speed: 0, eta: "--" },
      createItem({
        id: "playlist-download-2",
        title: "Playlist Video 2",
        thumbnail: "",
        sourceUrl: "https://www.youtube.com/watch?v=playlist-video-2"
      })
    );

    await vi.waitFor(() => expect(nativeImageMock.createFromBuffer).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "https://i.ytimg.com/vi/playlist-video-2/hqdefault.jpg",
      { headers: { "user-agent": "Mozilla/5.0" } }
    );
    vi.unstubAllGlobals();
  });

  it("falls back to the application icon when the thumbnail fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const service = new NativeNotificationService(createSettings());

    service.handleDownloadStateChange(
      { id: "download-thumbnail-error", status: "completed", progress: 100, downloadedSize: 100, fileSize: 100, speed: 0, eta: "--" },
      createItem({ id: "download-thumbnail-error", thumbnail: "https://example.com/thumbnail.jpg" })
    );

    await vi.waitFor(() => expect(notificationConstructor).toHaveBeenCalledTimes(1));
    expect(notificationInstances[0]?.options).toEqual(expect.objectContaining({
      title: "Example Video",
      body: "Download completed successfully",
      icon: expect.anything()
    }));
    vi.unstubAllGlobals();
  });

  it("ignores non-terminal download states", () => {
    const service = new NativeNotificationService(createSettings());
    const statuses = ["queued", "analyzing", "downloading", "paused", "retrying", "merging", "converting", "canceled"] as const;

    statuses.forEach((status) => {
      service.handleDownloadStateChange(
        { id: `download-${status}`, status, progress: 0, downloadedSize: 0, fileSize: 100, speed: 0, eta: "--" },
        createItem({ id: `download-${status}`, status })
      );
    });

    expect(notificationConstructor).not.toHaveBeenCalled();
  });

  it("deduplicates terminal events and allows a new retry lifecycle", async () => {
    const service = new NativeNotificationService(createSettings());
    const completed = { id: "download-1", status: "completed" as const, progress: 100, downloadedSize: 100, fileSize: 100, speed: 0, eta: "--" };
    const failed = { id: "download-1", status: "failed" as const, progress: 10, downloadedSize: 10, fileSize: 100, speed: 0, eta: "--", errorMessage: "Failed" };
    const retrying = { id: "download-1", status: "retrying" as const, progress: 10, downloadedSize: 10, fileSize: 100, speed: 0, eta: "--" };

    const item = { sourceUrl: "https://example.com/video" };
    service.handleDownloadStateChange(completed, createItem(item));
    service.handleDownloadStateChange(completed, createItem(item));
    service.handleDownloadStateChange(retrying, createItem({ status: "retrying" }));
    service.handleDownloadStateChange(failed, createItem({ ...item, status: "failed" }));
    service.handleDownloadStateChange(failed, createItem({ ...item, status: "failed" }));

    await vi.waitFor(() => expect(notificationConstructor).toHaveBeenCalledTimes(2));
  });

  it("notifies scheduled triggers once per schedule and trigger count", () => {
    const service = new NativeNotificationService(createSettings());
    const first = createSchedule();

    service.notifyScheduledDownload(first);
    service.notifyScheduledDownload(first);
    service.notifyScheduledDownload(createSchedule({ triggerCount: 2 }));

    expect(notificationConstructor).toHaveBeenCalledTimes(2);
    expect(notificationInstances[0]?.options).toMatchObject({ body: "Scheduled download queued" });
  });

  it("uses scheduled video thumbnail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" }
    })));
    const service = new NativeNotificationService(createSettings());

    service.notifyScheduledDownload(createSchedule(), {
      id: "scheduled-video-1",
      sourceUrl: "https://www.youtube.com/watch?v=example",
      linkType: "video",
      thumbnail: "https://example.com/scheduled-thumbnail.jpg",
      title: "Example Video",
      channelName: "Example Channel",
      duration: "10:00",
      views: 100,
      qualityOptions: ["720p"],
      videoFormats: ["mp4"],
      audioFormats: ["mp3"],
      resolution: "720p",
      fps: 30,
      videoCodec: "H.264",
      audioCodec: "AAC",
      videoBitrate: "1 Mbps",
      audioBitrate: "128 Kbps",
      container: "mp4",
      fileSize: 100,
      uploadDate: "2026-08-19"
    });

    await vi.waitFor(() => expect(nativeImageMock.createFromBuffer).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it("handles unsupported notifications gracefully", () => {
    notificationConstructor.isSupported.mockReturnValue(false);
    const service = new NativeNotificationService(createSettings());

    expect(() => service.notifyScheduledDownload(createSchedule())).not.toThrow();
    expect(notificationConstructor).not.toHaveBeenCalled();
  });

  it("handles constructor errors without propagating them", () => {
    notificationConstructor.mockImplementationOnce(() => {
      throw new Error("Notification unavailable");
    });
    const service = new NativeNotificationService(createSettings());

    expect(() => service.notifyScheduledDownload(createSchedule())).not.toThrow();
    expect(() => service.notifyScheduledDownload(createSchedule({ triggerCount: 2 }))).not.toThrow();
    expect(notificationConstructor).toHaveBeenCalledTimes(2);
  });
});
