/**
 * Download IPC Integration Tests
 *
 * Tests the full IPC chain for download operations:
 * Renderer Adapter → IPC Channel → Handler → NativeDownloadService → ProcessExecutor
 *
 * Uses MockProcessExecutor to simulate yt-dlp without network dependency.
 *
 * Test Coverage:
 * - IPC channel contracts (request/response envelopes)
 * - Download operations (add, start, pause, resume, cancel, retry, remove, reorder)
 * - Error propagation through IPC chain
 * - Progress and state-change events
 * - Concurrent download limits
 * - ElectronDownloadService adapter behavior
 */

import { describe, it, expect, beforeEach } from "vitest";
import { IPC_CHANNELS, IPC_EVENTS, type IpcResult } from "./channels";
import { NativeDownloadService, ProcessExecutor } from "../services/nativeDownloadService";
import type { DownloadItem } from "../../src/types/download";
import type { AppSettings } from "../../src/types/settings";
import { EventEmitter } from "events";

// ─── MockProcessExecutor (reused from nativeDownloadService.test.ts) ───────

interface SpawnBehavior {
  stdout?: string;
  stderr?: string;
  exitCode: number;
  delay?: number;
  error?: { code: string };
}

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  kill(): void {
    this.killed = true;
    this.emit("exit", null);
  }
}

class MockProcessExecutor implements ProcessExecutor {
  private spawnBehaviors: Map<string, SpawnBehavior> = new Map();
  private accessBehaviors: Map<string, boolean> = new Map();

  setSpawnBehavior(command: string, behavior: SpawnBehavior): void {
    this.spawnBehaviors.set(command, behavior);
  }

  setAccessBehavior(path: string, shouldSucceed: boolean): void {
    this.accessBehaviors.set(path, shouldSucceed);
  }

  spawn(command: string, _args: string[], _options?: any): any {
    const behavior = this.spawnBehaviors.get(command) || { exitCode: 0 };

    const proc = new MockChildProcess();

    if (behavior.error) {
      setImmediate(() => {
        const err: any = new Error("Spawn error");
        err.code = behavior.error!.code;
        proc.emit("error", err);
      });
      return proc;
    }

    const delay = behavior.delay || 10;

    setTimeout(() => {
      if (behavior.stdout) {
        proc.stdout.emit("data", Buffer.from(behavior.stdout));
      }
      if (behavior.stderr) {
        proc.stderr.emit("data", Buffer.from(behavior.stderr));
      }
      proc.emit("exit", behavior.exitCode);
    }, delay);

    return proc;
  }

  async checkAccess(path: string, _mode?: number): Promise<void> {
    const shouldSucceed = this.accessBehaviors.get(path) || false;
    if (!shouldSucceed) {
      throw new Error(`ENOENT: no such file or directory, access '${path}'`);
    }
  }
}

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createMockSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    downloadFolder: "C:\\Downloads",
    startWithWindows: false,
    minimizeToTray: false,
    appearance: "system",
    language: "en",
    concurrentDownloads: 3,
    speedLimit: "unlimited",
    defaultQuality: "1080p",
    defaultVideoFormat: "mp4",
    defaultAudioFormat: "mp3",
    enableNotifications: true,
    notificationWhenCompleted: true,
    notificationWhenFailed: true,
    clipboardMonitoring: false,
    askBeforeDownloading: false,
    fileNameTemplate: "{title}.{ext}",
    ytdlpPath: "",
    ffmpegPath: "",
    proxy: "",
    ...overrides
  };
}

function createMockDownloadItem(overrides?: Partial<DownloadItem>): DownloadItem {
  return {
    id: crypto.randomUUID(),
    metadataId: "meta-1",
    thumbnail: "https://example.com/thumb.jpg",
    title: "Test Video",
    sourceUrl: "https://www.youtube.com/watch?v=test123",
    quality: "1080p",
    format: "mp4",
    fileSize: 100 * 1024 * 1024,
    downloadedSize: 0,
    speed: 0,
    eta: "--",
    progress: 0,
    status: "queued",
    order: 1,
    addedAt: new Date().toISOString(),
    phaseStartedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    retryCount: 0,
    ...overrides
  };
}

/**
 * Simulates IPC handler invocation (mimics what ipcMain.handle does)
 */
async function simulateHandler<T>(
  channel: string,
  payload: any,
  service: NativeDownloadService
): Promise<IpcResult<T>> {
  try {
    let result: any;

    switch (channel) {
      case IPC_CHANNELS.DOWNLOAD_GET_ALL:
        result = await service.getAll();
        break;
      case IPC_CHANNELS.DOWNLOAD_ADD:
        result = await service.add(payload.item);
        break;
      case IPC_CHANNELS.DOWNLOAD_START:
        result = await service.start(payload.id);
        break;
      case IPC_CHANNELS.DOWNLOAD_PAUSE:
        result = await service.pause(payload.id);
        break;
      case IPC_CHANNELS.DOWNLOAD_RESUME:
        result = await service.resume(payload.id);
        break;
      case IPC_CHANNELS.DOWNLOAD_CANCEL:
        result = await service.cancel(payload.id);
        break;
      case IPC_CHANNELS.DOWNLOAD_RETRY:
        result = await service.retry(payload.id);
        break;
      case IPC_CHANNELS.DOWNLOAD_REMOVE:
        result = await service.remove(payload.id);
        break;
      case IPC_CHANNELS.DOWNLOAD_REORDER:
        result = await service.reorder(payload.orderedIds);
        break;
      default:
        throw new Error(`Unknown channel: ${channel}`);
    }

    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: { code: "unknown", message, recoverable: true }
    };
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Download IPC Integration", () => {
  let mockExecutor: MockProcessExecutor;
  let settings: AppSettings;
  let service: NativeDownloadService;

  beforeEach(() => {
    mockExecutor = new MockProcessExecutor();
    settings = createMockSettings();
    service = new NativeDownloadService(settings, mockExecutor);

    // Setup default yt-dlp mock
    mockExecutor.setAccessBehavior("yt-dlp", true);
    mockExecutor.setSpawnBehavior("yt-dlp", {
      stdout: "download:50000|100000|25000|00:02\n",
      stderr: "",
      exitCode: 0
    });
  });

  // ─── IPC Channel Contract ───────────────────────────────────────────────

  describe("IPC channel contract", () => {
    it("should use correct channel for DOWNLOAD_GET_ALL", async () => {
      expect(IPC_CHANNELS.DOWNLOAD_GET_ALL).toBe("download:get-all");
    });

    it("should use correct channel for DOWNLOAD_ADD", async () => {
      expect(IPC_CHANNELS.DOWNLOAD_ADD).toBe("download:add");
    });

    it("should use correct channel for DOWNLOAD_START", async () => {
      expect(IPC_CHANNELS.DOWNLOAD_START).toBe("download:start");
    });

    it("should use correct channel for DOWNLOAD_PAUSE", async () => {
      expect(IPC_CHANNELS.DOWNLOAD_PAUSE).toBe("download:pause");
    });

    it("should use correct channel for DOWNLOAD_RESUME", async () => {
      expect(IPC_CHANNELS.DOWNLOAD_RESUME).toBe("download:resume");
    });

    it("should use correct channel for DOWNLOAD_CANCEL", async () => {
      expect(IPC_CHANNELS.DOWNLOAD_CANCEL).toBe("download:cancel");
    });

    it("should use correct channel for DOWNLOAD_RETRY", async () => {
      expect(IPC_CHANNELS.DOWNLOAD_RETRY).toBe("download:retry");
    });

    it("should use correct channel for DOWNLOAD_REMOVE", async () => {
      expect(IPC_CHANNELS.DOWNLOAD_REMOVE).toBe("download:remove");
    });

    it("should use correct event channel for DOWNLOAD_PROGRESS", () => {
      expect(IPC_EVENTS.DOWNLOAD_PROGRESS).toBe("download:progress");
    });

    it("should use correct event channel for DOWNLOAD_STATE_CHANGE", () => {
      expect(IPC_EVENTS.DOWNLOAD_STATE_CHANGE).toBe("download:state-change");
    });
  });

  // ─── IPC Handler Simulation ─────────────────────────────────────────────

  describe("IPC handler responses", () => {
    it("should return IpcResult envelope on success", async () => {
      const item = createMockDownloadItem();
      const result = await simulateHandler<DownloadItem>(IPC_CHANNELS.DOWNLOAD_ADD, { item }, service);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.id).toBe(item.id);
      }
    });

    it("should return error envelope on failure", async () => {
      const result = await simulateHandler(IPC_CHANNELS.DOWNLOAD_START, { id: "non-existent" }, service);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.code).toBe("unknown");
        expect(result.error.message).toContain("not found");
      }
    });
  });

  // ─── Download Operations ────────────────────────────────────────────────

  describe("download operations via IPC", () => {
    it("should add download item via IPC", async () => {
      const item = createMockDownloadItem();
      const result = await simulateHandler<DownloadItem>(IPC_CHANNELS.DOWNLOAD_ADD, { item }, service);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(item.id);
        expect(result.data.status).toBe("queued");
      }
    });

    it("should get all downloads via IPC", async () => {
      const item1 = createMockDownloadItem();
      const item2 = createMockDownloadItem();

      await service.add(item1);
      await service.add(item2);

      const result = await simulateHandler<DownloadItem[]>(IPC_CHANNELS.DOWNLOAD_GET_ALL, {}, service);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });

    it("should start download via IPC", async () => {
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      const result = await simulateHandler<DownloadItem>(IPC_CHANNELS.DOWNLOAD_START, { id: item.id }, service);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("downloading");
      }
    });

    it("should pause download via IPC", async () => {
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 20));

      const result = await simulateHandler<DownloadItem>(IPC_CHANNELS.DOWNLOAD_PAUSE, { id: item.id }, service);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("paused");
      }
    });

    it("should resume download via IPC", async () => {
      const item = createMockDownloadItem({ status: "paused" });
      await service.add(item);

      const result = await simulateHandler<DownloadItem>(IPC_CHANNELS.DOWNLOAD_RESUME, { id: item.id }, service);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("downloading");
      }
    });

    it("should cancel download via IPC", async () => {
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 20));

      const result = await simulateHandler<DownloadItem>(IPC_CHANNELS.DOWNLOAD_CANCEL, { id: item.id }, service);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("canceled");
      }
    });

    it("should retry download via IPC", async () => {
      const item = createMockDownloadItem({ status: "failed" });
      await service.add(item);

      const result = await simulateHandler<DownloadItem>(IPC_CHANNELS.DOWNLOAD_RETRY, { id: item.id }, service);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("retrying");
        expect(result.data.retryCount).toBe(1);
      }
    });

    it("should remove download via IPC", async () => {
      const item = createMockDownloadItem();
      await service.add(item);

      const result = await simulateHandler<string>(IPC_CHANNELS.DOWNLOAD_REMOVE, { id: item.id }, service);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(item.id);
      }

      const all = await service.getAll();
      expect(all).toHaveLength(0);
    });

    it("should reorder downloads via IPC", async () => {
      const item1 = createMockDownloadItem();
      const item2 = createMockDownloadItem();
      const item3 = createMockDownloadItem();

      await service.add(item1);
      await service.add(item2);
      await service.add(item3);

      const result = await simulateHandler<DownloadItem[]>(
        IPC_CHANNELS.DOWNLOAD_REORDER,
        { orderedIds: [item3.id, item1.id, item2.id] },
        service
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0].id).toBe(item3.id);
        expect(result.data[1].id).toBe(item1.id);
        expect(result.data[2].id).toBe(item2.id);
      }
    });
  });

  // ─── Error Propagation ──────────────────────────────────────────────────

  describe("error propagation through IPC", () => {
    it("should propagate item not found error", async () => {
      const result = await simulateHandler(IPC_CHANNELS.DOWNLOAD_START, { id: "invalid-id" }, service);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not found");
      }
    });

    it("should propagate concurrent limit error", async () => {
      settings.concurrentDownloads = 1;
      service = new NativeDownloadService(settings, mockExecutor);

      // Setup spawn behavior for successful download
      mockExecutor.setAccessBehavior("yt-dlp", true);
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:50000|100000|25000|00:02\n",
        stderr: "",
        exitCode: 0,
        delay: 100
      });

      const item1 = createMockDownloadItem({ status: "analyzing" });
      const item2 = createMockDownloadItem({ status: "analyzing" });

      await service.add(item1);
      await service.add(item2);

      // First start should succeed
      const result1 = await simulateHandler(IPC_CHANNELS.DOWNLOAD_START, { id: item1.id }, service);
      expect(result1.success).toBe(true);

      // Wait for download to actually start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second start should fail due to concurrent limit
      const result2 = await simulateHandler(IPC_CHANNELS.DOWNLOAD_START, { id: item2.id }, service);

      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.message).toContain("Concurrent download limit");
      }
    });

    it("should propagate yt-dlp not found error", async () => {
      mockExecutor.setAccessBehavior("yt-dlp", false);
      mockExecutor.setSpawnBehavior("yt-dlp", { exitCode: 1 });
      mockExecutor.setSpawnBehavior("yt-dlp.exe", { exitCode: 1 });
      mockExecutor.setSpawnBehavior("youtube-dl", { exitCode: 1 });
      mockExecutor.setSpawnBehavior("youtube-dl.exe", { exitCode: 1 });

      service = new NativeDownloadService(settings, mockExecutor);

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      const result = await simulateHandler(IPC_CHANNELS.DOWNLOAD_START, { id: item.id }, service);

      expect(result.success).toBe(false);
    });
  });

  // ─── Event Emission ─────────────────────────────────────────────────────

  describe("progress and state-change events", () => {
    beforeEach(async () => {
      // Cache yt-dlp path to avoid resolution issues in tests
      mockExecutor.setAccessBehavior("yt-dlp", true);
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "2024.01.01",
        stderr: "",
        exitCode: 0,
        delay: 10
      });

      // Trigger path resolution
      const tempItem = createMockDownloadItem({ status: "analyzing" });
      await service.add(tempItem);
      await service.start(tempItem.id).catch(() => { });  // Will cache ytdlp path
      await service.remove(tempItem.id);
    });

    it("should emit progress events during download", async () => {
      const progressEvents: any[] = [];
      service.on("download:progress", (payload) => progressEvents.push(payload));

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:50.0%|47.7MiB|95.4MiB|4.77MiB/s|00:10\n",
        stderr: "",
        exitCode: 0,
        delay: 50
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(progressEvents.length).toBeGreaterThan(0);
      const lastProgress = progressEvents[progressEvents.length - 1];
      expect(lastProgress.id).toBe(item.id);
      expect(lastProgress.progress).toBeCloseTo(50, 0);
    });

    it("should emit state-change events during lifecycle", async () => {
      const stateChangeEvents: any[] = [];
      service.on("download:state-change", (payload) => stateChangeEvents.push(payload));

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:50.0%|47.7KiB|95.4KiB|25.0KiB/s|00:02\n",
        stderr: "",
        exitCode: 0,
        delay: 50
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(stateChangeEvents.length).toBeGreaterThan(0);
      const statuses = stateChangeEvents.map((e) => e.status);
      expect(statuses).toContain("downloading");
    });

    it("should emit state-change event with error details on failure", async () => {
      const stateChangeEvents: any[] = [];
      service.on("download:state-change", (payload) => stateChangeEvents.push(payload));

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "ERROR: Video unavailable",
        exitCode: 1,
        delay: 50
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const failedEvent = stateChangeEvents.find((e) => e.status === "failed");
      expect(failedEvent).toBeDefined();
      if (failedEvent) {
        expect(failedEvent.errorCode).toBe("video_unavailable");
        expect(failedEvent.errorMessage).toBeDefined();
      }
    });
  });

  // ─── Concurrent Downloads ───────────────────────────────────────────────

  describe("concurrent download management via IPC", () => {
    it("should respect concurrent limit across multiple IPC calls", async () => {
      settings.concurrentDownloads = 2;
      service = new NativeDownloadService(settings, mockExecutor);

      // Use a long delay so downloads stay active when the third start is attempted
      mockExecutor.setAccessBehavior("yt-dlp", true);
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:50000|100000|25000|00:02\n",
        stderr: "",
        exitCode: 0,
        delay: 5000
      });

      const item1 = createMockDownloadItem({ status: "analyzing" });
      const item2 = createMockDownloadItem({ status: "analyzing" });
      const item3 = createMockDownloadItem({ status: "analyzing" });

      await simulateHandler(IPC_CHANNELS.DOWNLOAD_ADD, { item: item1 }, service);
      await simulateHandler(IPC_CHANNELS.DOWNLOAD_ADD, { item: item2 }, service);
      await simulateHandler(IPC_CHANNELS.DOWNLOAD_ADD, { item: item3 }, service);

      await simulateHandler(IPC_CHANNELS.DOWNLOAD_START, { id: item1.id }, service);
      await simulateHandler(IPC_CHANNELS.DOWNLOAD_START, { id: item2.id }, service);

      const result = await simulateHandler(IPC_CHANNELS.DOWNLOAD_START, { id: item3.id }, service);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Concurrent download limit");
      }
    });
  });
});
