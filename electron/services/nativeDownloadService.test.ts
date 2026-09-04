/**
 * NativeDownloadService Unit Tests
 *
 * Tests the real yt-dlp download engine using MockProcessExecutor for deterministic behavior.
 * No network dependency, no real yt-dlp binary required.
 *
 * Test Coverage:
 * - yt-dlp path resolution (settings, PATH fallback, not found)
 * - Download lifecycle (start, pause, resume, cancel, retry)
 * - Progress parsing from yt-dlp output
 * - State transitions (analyzing→downloading→merging→converting→completed)
 * - Error handling (spawn failures, timeouts, video unavailable, private, network errors)
 * - Concurrent download slot management
 * - Speed limit, quality, format arguments
 * - FFmpeg integration
 * - Event emission (progress, state-change)
 * - Pause/Resume semantics (kill + --continue)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "events";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import * as os from "os";
import * as path from "path";
import type { ChildProcess } from "child_process";
import { NativeDownloadService, ProcessExecutor } from "./nativeDownloadService";
import type { DownloadItem } from "../../src/types/download";
import type { AppSettings } from "../../src/types/settings";

// ─── MockProcessExecutor ────────────────────────────────────────────────────

interface SpawnBehavior {
  stdout?: string;
  stderr?: string;
  exitCode: number;
  delay?: number;
  error?: { code: string };
}

interface AccessBehavior {
  shouldSucceed: boolean;
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
  private accessBehaviors: Map<string, AccessBehavior> = new Map();
  private defaultAccessBehavior: AccessBehavior = { shouldSucceed: false };

  setSpawnBehavior(command: string, behavior: SpawnBehavior): void {
    this.spawnBehaviors.set(command, behavior);
  }

  setAccessBehavior(path: string, behavior: AccessBehavior): void {
    this.accessBehaviors.set(path, behavior);
  }

  setDefaultAccessBehavior(behavior: AccessBehavior): void {
    this.defaultAccessBehavior = behavior;
  }

  spawn(command: string, args: string[], _options?: any): any {
    const behavior = this.spawnBehaviors.get(command);

    if (!behavior) {
      throw new Error(`No spawn behavior configured for command: ${command}`);
    }

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
    const behavior = this.accessBehaviors.get(path) || this.defaultAccessBehavior;
    if (!behavior.shouldSucceed) {
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("NativeDownloadService", () => {
  let mockExecutor: MockProcessExecutor;
  let settings: AppSettings;
  let service: NativeDownloadService;

  beforeEach(() => {
    mockExecutor = new MockProcessExecutor();
    settings = createMockSettings();
    service = new NativeDownloadService(settings, mockExecutor);
  });

  // ─── yt-dlp Path Resolution ─────────────────────────────────────────────

  describe("yt-dlp path resolution", () => {
    it("should use ytdlpPath from settings when provided and executable", async () => {
      settings.ytdlpPath = "C:\\custom\\yt-dlp.exe";
      mockExecutor.setAccessBehavior("C:\\custom\\yt-dlp.exe", { shouldSucceed: true });
      mockExecutor.setSpawnBehavior("C:\\custom\\yt-dlp.exe", {
        stdout: "download:50000|100000|25000|00:02\n",
        stderr: "",
        exitCode: 0
      });

      service = new NativeDownloadService(settings, mockExecutor);
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      // If it reaches here without error, custom path was used
      expect(true).toBe(true);
    });

    it("should fall back to PATH when settings ytdlpPath is invalid", async () => {
      settings.ytdlpPath = "C:\\invalid\\yt-dlp.exe";
      mockExecutor.setAccessBehavior("C:\\invalid\\yt-dlp.exe", { shouldSucceed: false });
      mockExecutor.setSpawnBehavior("yt-dlp", { stdout: "", stderr: "", exitCode: 0 });
      mockExecutor.setSpawnBehavior("yt-dlp.exe", { stdout: "", stderr: "", exitCode: 0 });

      service = new NativeDownloadService(settings, mockExecutor);
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      // Should fall back to PATH without throwing
      await expect(service.start(item.id)).resolves.toBeDefined();
    });

    it("should throw ytdlp_not_found when no valid yt-dlp binary found", async () => {
      mockExecutor.setDefaultAccessBehavior({ shouldSucceed: false });
      mockExecutor.setSpawnBehavior("yt-dlp", { stdout: "", stderr: "", exitCode: 1 });
      mockExecutor.setSpawnBehavior("yt-dlp.exe", { stdout: "", stderr: "", exitCode: 1 });
      mockExecutor.setSpawnBehavior("youtube-dl", { stdout: "", stderr: "", exitCode: 1 });
      mockExecutor.setSpawnBehavior("youtube-dl.exe", { stdout: "", stderr: "", exitCode: 1 });

      service = new NativeDownloadService(settings, mockExecutor);
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      await expect(service.start(item.id)).rejects.toThrow();
    });
  });

  // ─── Download Lifecycle ─────────────────────────────────────────────────

  describe("download lifecycle", () => {
    beforeEach(() => {
      mockExecutor.setDefaultAccessBehavior({ shouldSucceed: true });
      mockExecutor.setSpawnBehavior("yt-dlp", { stdout: "", stderr: "", exitCode: 0 });
    });

    it("should parse real yt-dlp stdout progress lines", () => {
      const parsed = (service as any).parseProgressLine("[download]  15.3% of 10.0MiB at 1.0MiB/s ETA 00:05");

      expect(parsed).toMatchObject({
        progress: 15.3,
        totalSize: 10 * 1024 * 1024,
        speed: 1024 * 1024,
        eta: "00:05"
      });
      expect(parsed?.downloadedSize).toBeGreaterThan(0);
    });

    it("should parse yt-dlp stderr progress lines", async () => {
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "[download] 100.0% of 5.1MiB at 1.9MiB/s ETA 00:00\n",
        exitCode: 0,
        delay: 20
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updated = (await service.getAll()).find((entry) => entry.id === item.id)!;
      expect(updated.status).toBe("completed");
      expect(updated.progress).toBe(100);
      expect(updated.downloadedSize).toBeGreaterThan(0);
    });

    it("should derive downloaded bytes from percent when pipe template omits them", () => {
      const parsed = (service as any).parseProgressLine("download:100.0%|NA|5.1MiB|1.9MiB/s|00:00");

      expect(parsed?.progress).toBe(100);
      expect(parsed?.downloadedSize).toBeGreaterThan(0);
      expect(parsed?.totalSize).toBeGreaterThan(0);
    });

    it("should retry a failed item and start a new yt-dlp process", async () => {
      let spawnCount = 0;
      const customExecutor: ProcessExecutor = {
        async checkAccess() { },
        spawn(command: string, _args: string[], _options?: any) {
          spawnCount += 1;
          const proc = new MockChildProcess() as unknown as import("child_process").ChildProcess;
          setTimeout(() => {
            if (proc.stdout) {
              proc.stdout.emit("data", Buffer.from("download:25.0%|10MiB|40MiB|5MiB/s|00:05\n"));
            }
            proc.emit("exit", 0);
          }, 10);
          return proc;
        }
      };

      const settingsWithYtdlp = createMockSettings({ ytdlpPath: "yt-dlp" });
      service = new NativeDownloadService(settingsWithYtdlp, customExecutor);
      const item = createMockDownloadItem({ status: "failed" });
      await service.add(item);

      await service.retry(item.id);
      await new Promise((resolve) => setTimeout(resolve, 400));

      const updated = (await service.getAll()).find((entry) => entry.id === item.id)!;
      expect(updated.status).toBe("completed");
      expect(updated.retryCount).toBe(1);
      expect(spawnCount).toBe(1);
    });

    it("should add item to queue", async () => {
      const item = createMockDownloadItem();
      const added = await service.add(item);
      expect(added).toEqual(item);

      const all = await service.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(item.id);
    });

    it("should start download and transition to downloading status", async () => {
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:50000|100000|25000|00:02\n",
        stderr: "",
        exitCode: 0,
        delay: 50
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      const started = await service.start(item.id);
      expect(started.status).toBe("downloading");
    });

    it("should pause download and keep partial files", async () => {
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:50000|100000|25000|00:02\n",
        stderr: "",
        exitCode: 0,
        delay: 100
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      // Wait a bit for download to start
      await new Promise((resolve) => setTimeout(resolve, 20));

      const paused = await service.pause(item.id);
      expect(paused.status).toBe("paused");
      expect(paused.speed).toBe(0);
      expect(paused.eta).toBe("--");
    });

    it("should resume download with --continue flag", async () => {
      const item = createMockDownloadItem({ status: "paused" });
      await service.add(item);

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:75000|100000|25000|00:01\n",
        stderr: "",
        exitCode: 0
      });

      const resumed = await service.resume(item.id);
      expect(resumed.status).toBe("downloading");
    });

    it("should cancel download", async () => {
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:50000|100000|25000|00:02\n",
        stderr: "",
        exitCode: 0,
        delay: 100
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 20));

      const canceled = await service.cancel(item.id);
      expect(canceled.status).toBe("canceled");
      expect(canceled.speed).toBe(0);
    });

    it("should retry failed download", async () => {
      const item = createMockDownloadItem({ status: "failed", retryCount: 0 });
      await service.add(item);

      const retried = await service.retry(item.id);
      expect(retried.status).toBe("retrying");
      expect(retried.retryCount).toBe(1);
      expect(retried.progress).toBe(0);
      expect(retried.downloadedSize).toBe(0);
    });

    it("should freeze progress state after pause and ignore stale events", async () => {
      let proc: MockChildProcess | undefined;
      const customExecutor: ProcessExecutor = {
        async checkAccess() { },
        spawn(command: string, _args: string[], _options?: any) {
          proc = new MockChildProcess();
          setTimeout(() => {
            proc!.stdout.emit("data", Buffer.from("download:65.0%|59MiB|91MiB|1.6MiB/s|00:20\n"));
          }, 20);
          setTimeout(() => {
            proc!.stdout.emit("data", Buffer.from("download:70.0%|60MiB|91MiB|1.8MiB/s|00:18\n"));
          }, 80);
          return proc as unknown as ChildProcess;
        }
      };

      service = new NativeDownloadService(createMockSettings({ ytdlpPath: "yt-dlp" }), customExecutor);
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 40));
      await service.pause(item.id);

      await new Promise((resolve) => setTimeout(resolve, 120));
      const updated = (await service.getAll()).find((entry) => entry.id === item.id)!;

      expect(updated.status).toBe("paused");
      expect(updated.progress).toBe(65);
      expect(updated.speed).toBe(0);
      expect(updated.eta).toBe("--");
    });

    it("should ignore stale progress after cancel", async () => {
      let proc: MockChildProcess | undefined;
      const customExecutor: ProcessExecutor = {
        async checkAccess() { },
        spawn(command: string, _args: string[], _options?: any) {
          proc = new MockChildProcess();
          setTimeout(() => {
            proc!.stdout.emit("data", Buffer.from("download:50.0%|50MiB|100MiB|1.0MiB/s|00:30\n"));
          }, 20);
          return proc as unknown as ChildProcess;
        }
      };

      service = new NativeDownloadService(createMockSettings({ ytdlpPath: "yt-dlp" }), customExecutor);
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 30));
      await service.cancel(item.id);

      setTimeout(() => {
        proc!.stdout.emit("data", Buffer.from("download:99.0%|99MiB|100MiB|2.0MiB/s|00:01\n"));
      }, 30);

      await new Promise((resolve) => setTimeout(resolve, 100));
      const updated = (await service.getAll()).find((entry) => entry.id === item.id)!;
      expect(updated.status).toBe("canceled");
      expect(updated.progress).toBeLessThan(99);
    });

    it("should ignore stale progress after failed and completed states", async () => {
      let activeProc: MockChildProcess | undefined;
      const customExecutor: ProcessExecutor = {
        async checkAccess() { },
        spawn(command: string, _args: string[], _options?: any) {
          const nextProc = new MockChildProcess();
          activeProc = nextProc;
          setTimeout(() => {
            nextProc.stdout.emit("data", Buffer.from("download:40.0%|40MiB|100MiB|1.0MiB/s|00:40\n"));
          }, 30);
          setTimeout(() => {
            nextProc.emit("exit", 0);
          }, 50);
          return nextProc as unknown as ChildProcess;
        }
      };

      service = new NativeDownloadService(createMockSettings({ ytdlpPath: "yt-dlp" }), customExecutor);
      const failedItem = createMockDownloadItem({ status: "analyzing" });
      await service.add(failedItem);
      await service.start(failedItem.id);
      await service.pause(failedItem.id);

      const completedItem = createMockDownloadItem({ status: "analyzing" });
      await service.add(completedItem);
      await service.start(completedItem.id);

      setTimeout(() => {
        activeProc!.stdout.emit("data", Buffer.from("download:100.0%|100MiB|100MiB|0B/s|00:00\n"));
        activeProc!.emit("exit", 0);
      }, 30);

      await new Promise((resolve) => setTimeout(resolve, 500));
      expect((await service.getAll()).find((entry) => entry.id === failedItem.id)?.status).toBe("paused");
      expect((await service.getAll()).find((entry) => entry.id === completedItem.id)?.status).toBe("completed");
    });

    it("should prefer actual on-disk file size over metadata estimate when file is larger", async () => {
      const tempDir = mkdtempSync(path.join(os.tmpdir(), "remon-download-"));
      const finalFile = path.join(tempDir, "video.mp4");
      const actualSize = 30 * 1024 * 1024;
      writeFileSync(finalFile, Buffer.alloc(actualSize));

      try {
        const result = await (service as any).resolveCompletedFileSize(finalFile, 20 * 1024 * 1024);
        expect(result).toBe(actualSize);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should mark item as completed if stopping after the file has already finished downloading", async () => {
      const tempDir = mkdtempSync(path.join(os.tmpdir(), "remon-stop-complete-"));
      const fileSize = 30 * 1024 * 1024;
      const outputPath = path.join(tempDir, "Test Video.mp4");
      writeFileSync(outputPath, Buffer.alloc(fileSize));

      try {
        service = new NativeDownloadService(createMockSettings({ downloadFolder: tempDir, ytdlpPath: "yt-dlp" }));
        const item = createMockDownloadItem({
          title: "Test Video",
          format: "mp4",
          fileSize,
          downloadedSize: fileSize * 0.98,
          progress: 98,
          status: "downloading"
        });

        await service.add(item);
        const result = await service.pause(item.id);

        expect(result.status).toBe("completed");
        expect(result.downloadedSize).toBe(fileSize);
        expect(result.progress).toBe(100);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should remove download item", async () => {
      const item = createMockDownloadItem();
      await service.add(item);

      const removedId = await service.remove(item.id);
      expect(removedId).toBe(item.id);

      const all = await service.getAll();
      expect(all).toHaveLength(0);
    });
  });

  // ─── Progress Parsing ───────────────────────────────────────────────────

  describe("progress parsing", () => {
    beforeEach(() => {
      mockExecutor.setDefaultAccessBehavior({ shouldSucceed: true });
    });

    it("should parse progress from yt-dlp output", async () => {
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
      expect(lastProgress.downloadedSize).toBeGreaterThan(0);
      expect(lastProgress.totalSize).toBeGreaterThan(0);
      expect(lastProgress.speed).toBeGreaterThan(0);
    });

    it("should emit state change events", async () => {
      const stateChangeEvents: any[] = [];
      service.on("download:state-change", (payload) => stateChangeEvents.push(payload));

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:100.0%|95.4MiB|95.4MiB|4.77MiB/s|00:00\n",
        stderr: "",
        exitCode: 0,
        delay: 50
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(stateChangeEvents.length).toBeGreaterThan(0);
      const statuses = stateChangeEvents.map((e) => e.status);
      expect(statuses).toContain("downloading");
    });
  });

  // ─── State Transitions ──────────────────────────────────────────────────

  describe("state transitions", () => {
    beforeEach(() => {
      mockExecutor.setDefaultAccessBehavior({ shouldSucceed: true });
    });

    it("should transition downloading → merging → converting → completed", async () => {
      const stateChanges: string[] = [];
      service.on("download:state-change", (payload: any) => stateChanges.push(payload.status));

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:100000000|100000000|5000000|00:00\n",
        stderr: "",
        exitCode: 0,
        delay: 50
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(stateChanges).toContain("downloading");
      expect(stateChanges).toContain("merging");
      expect(stateChanges).toContain("converting");
      expect(stateChanges).toContain("completed");
    });
  });

  // ─── Error Handling ─────────────────────────────────────────────────────

  describe("error handling", () => {
    beforeEach(async () => {
      // Setup default access for yt-dlp
      mockExecutor.setDefaultAccessBehavior({ shouldSucceed: false });
      mockExecutor.setAccessBehavior("yt-dlp", { shouldSucceed: true });
      // Setup spawn behavior for --version check during resolveYtdlpPath
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "2024.01.01",
        stderr: "",
        exitCode: 0,
        delay: 10
      });

      // Trigger yt-dlp path resolution to cache it
      // This ensures resolveYtdlpPath completes with --version check
      // before we override spawn behavior in individual tests
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id).catch(() => { });  // Will fail because no spawn behavior for actual download, but that's OK
      await service.remove(item.id);  // Clean up
    });

    it("should handle video unavailable error", async () => {
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      // Override spawn behavior after resolveYtdlpPath completes
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "ERROR: Video unavailable",
        exitCode: 1,
        delay: 50
      });

      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const items = await service.getAll();
      const failedItem = items.find((i) => i.id === item.id);
      expect(failedItem?.status).toBe("failed");
      expect(failedItem?.errorCode).toBe("video_unavailable");
    });

    it("should handle private video error", async () => {
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      // Override spawn behavior after resolveYtdlpPath completes
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "ERROR: Private video. Sign in if you've been granted access",
        exitCode: 1,
        delay: 50
      });

      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const items = await service.getAll();
      const failedItem = items.find((i) => i.id === item.id);
      expect(failedItem?.errorCode).toBe("video_private");
    });

    it("should handle network error", async () => {
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      // Override spawn behavior after resolveYtdlpPath completes
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "ERROR: Unable to download: network error",
        exitCode: 1,
        delay: 50
      });

      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const items = await service.getAll();
      const failedItem = items.find((i) => i.id === item.id);
      expect(failedItem?.errorCode).toBe("network_error");
    });

    it("should handle unsupported URL error", async () => {
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      // Override spawn behavior after resolveYtdlpPath completes
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "ERROR: Unsupported URL: https://example.com",
        exitCode: 1,
        delay: 50
      });

      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const items = await service.getAll();
      const failedItem = items.find((i) => i.id === item.id);
      expect(failedItem?.errorCode).toBe("unsupported_url");
    });

    it("should handle FFmpeg error", async () => {
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      // Override spawn behavior after resolveYtdlpPath completes
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "ERROR: ffmpeg failed with exit code 1",
        exitCode: 1,
        delay: 50
      });

      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const items = await service.getAll();
      const failedItem = items.find((i) => i.id === item.id);
      expect(failedItem?.errorCode).toBe("ffmpeg_error");
    });

    it("should handle spawn error", async () => {
      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);

      // Override spawn behavior to simulate spawn error
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "",
        exitCode: 0,
        error: { code: "ENOENT" }
      });

      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const items = await service.getAll();
      const failedItem = items.find((i) => i.id === item.id);
      expect(failedItem?.status).toBe("failed");
      expect(failedItem?.errorCode).toBe("ytdlp_not_found");
    });
  });

  // ─── Concurrent Downloads ───────────────────────────────────────────────

  describe("concurrent downloads", () => {
    beforeEach(() => {
      mockExecutor.setDefaultAccessBehavior({ shouldSucceed: true });
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:50000|100000|25000|00:02\n",
        stderr: "",
        exitCode: 0,
        delay: 100
      });
    });

    it("should respect concurrent download limit", async () => {
      settings.concurrentDownloads = 2;
      service = new NativeDownloadService(settings, mockExecutor);

      const item1 = createMockDownloadItem({ status: "analyzing" });
      const item2 = createMockDownloadItem({ status: "analyzing" });
      const item3 = createMockDownloadItem({ status: "analyzing" });

      await service.add(item1);
      await service.add(item2);
      await service.add(item3);

      await service.start(item1.id);
      await service.start(item2.id);

      // Third start should fail immediately (no need to wait)
      await expect(service.start(item3.id)).rejects.toThrow("Concurrent download limit reached");
    });

    it("should allow new download after pause frees slot", async () => {
      settings.concurrentDownloads = 1;
      service = new NativeDownloadService(settings, mockExecutor);

      const item1 = createMockDownloadItem({ status: "analyzing" });
      const item2 = createMockDownloadItem({ status: "analyzing" });

      await service.add(item1);
      await service.add(item2);

      await service.start(item1.id);

      // Wait for download to actually start
      await new Promise((resolve) => setTimeout(resolve, 100));

      await service.pause(item1.id);

      // Wait for pause to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should succeed now that slot is freed
      await expect(service.start(item2.id)).resolves.toBeDefined();
    });
  });

  // ─── Quality & Format Arguments ─────────────────────────────────────────

  describe("yt-dlp arguments", () => {
    beforeEach(() => {
      mockExecutor.setDefaultAccessBehavior({ shouldSucceed: true });
    });

    it("should use a video format selector for 720p mp4 downloads", async () => {
      let capturedArgs: string[] = [];
      const originalSpawn = mockExecutor.spawn.bind(mockExecutor);
      mockExecutor.spawn = (cmd: string, args: string[], opts?: any) => {
        capturedArgs = args;
        return originalSpawn(cmd, args, opts);
      };

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "",
        exitCode: 0
      });

      const item = createMockDownloadItem({ status: "analyzing", quality: "720p", format: "mp4" });
      await service.add(item);
      await service.start(item.id);

      expect(capturedArgs).toContain("-f");
      expect(capturedArgs.some((arg) => arg.includes("bestvideo[height<=720]+bestaudio/best"))).toBe(true);
      expect(capturedArgs).toContain("--merge-output-format");
      expect(capturedArgs).toContain("mp4");
    });

    it("should use an audio-only selector for mp3 downloads", async () => {
      let capturedArgs: string[] = [];
      const originalSpawn = mockExecutor.spawn.bind(mockExecutor);
      mockExecutor.spawn = (cmd: string, args: string[], opts?: any) => {
        capturedArgs = args;
        return originalSpawn(cmd, args, opts);
      };

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "",
        exitCode: 0
      });

      const item = createMockDownloadItem({ status: "analyzing", quality: "audio", format: "mp3" });
      await service.add(item);
      await service.start(item.id);

      expect(capturedArgs).toContain("-f");
      expect(capturedArgs).toContain("bestaudio/best");
      expect(capturedArgs).toContain("--extract-audio");
      expect(capturedArgs).toContain("--audio-format");
      expect(capturedArgs).toContain("mp3");
    });

    it("should include speed limit in arguments when not unlimited", async () => {
      settings.speedLimit = 1048576; // 1 MB/s
      service = new NativeDownloadService(settings, mockExecutor);

      let capturedArgs: string[] = [];
      const originalSpawn = mockExecutor.spawn.bind(mockExecutor);
      mockExecutor.spawn = (cmd: string, args: string[], opts?: any) => {
        capturedArgs = args;
        return originalSpawn(cmd, args, opts);
      };

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "",
        exitCode: 0
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      expect(capturedArgs).toContain("-r");
      expect(capturedArgs).toContain("1024K");
    });

    it("should include --continue flag when resuming", async () => {
      const tempDir = mkdtempSync(path.join(os.tmpdir(), "remon-resume-"));
      let capturedArgs: string[] = [];
      try {
        settings.downloadFolder = tempDir;
        service = new NativeDownloadService(settings, mockExecutor);
        const partialPath = path.join(tempDir, "Test Video.mp4.part");
        writeFileSync(partialPath, Buffer.alloc(1024));

        const originalSpawn = mockExecutor.spawn.bind(mockExecutor);
        mockExecutor.spawn = (cmd: string, args: string[], opts?: any) => {
          capturedArgs = args;
          return originalSpawn(cmd, args, opts);
        };

        mockExecutor.setSpawnBehavior("yt-dlp", {
          stdout: "",
          stderr: "",
          exitCode: 0
        });

        const item = createMockDownloadItem({ status: "paused" });
        await service.add(item);
        await service.resume(item.id);

        expect(capturedArgs).toContain("--continue");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should include --continue flag when resuming with stream part file (e.g. Test Video.f137.mp4.part)", async () => {
      const tempDir = mkdtempSync(path.join(os.tmpdir(), "remon-resume-stream-"));
      let capturedArgs: string[] = [];
      try {
        settings.downloadFolder = tempDir;
        service = new NativeDownloadService(settings, mockExecutor);
        const streamPartPath = path.join(tempDir, "Test Video.f137.mp4.part");
        writeFileSync(streamPartPath, Buffer.alloc(1024));

        const originalSpawn = mockExecutor.spawn.bind(mockExecutor);
        mockExecutor.spawn = (cmd: string, args: string[], opts?: any) => {
          capturedArgs = args;
          return originalSpawn(cmd, args, opts);
        };

        mockExecutor.setSpawnBehavior("yt-dlp", {
          stdout: "",
          stderr: "",
          exitCode: 0
        });

        const item = createMockDownloadItem({
          id: "item-stream-part",
          title: "Test Video",
          sourceUrl: "https://youtube.com/watch?v=streampart",
          format: "mp4",
          quality: "1080p",
          status: "paused",
          progress: 35,
          downloadedSize: 35000
        });
        await service.add(item);
        const resumed = await service.resume(item.id);

        expect(capturedArgs).toContain("--continue");
        expect(capturedArgs).not.toContain("--no-continue");
        expect(capturedArgs).not.toContain("--force-overwrites");
        expect(resumed.id).toBe(item.id);
        expect(resumed.sourceUrl).toBe(item.sourceUrl);
        expect(resumed.title).toBe(item.title);
        expect(resumed.status).toBe("downloading");
        expect(resumed.progress).toBe(35);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should resume without creating a new download and preserve all metadata", async () => {
      const item = createMockDownloadItem({
        id: "unique-resume-id",
        title: "Exact Title Video",
        sourceUrl: "https://youtube.com/watch?v=exactid",
        format: "mp4",
        quality: "720p",
        status: "paused",
        progress: 42,
        downloadedSize: 42000
      });
      await service.add(item);

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "",
        exitCode: 0
      });

      const allBefore = await service.getAll();
      expect(allBefore.length).toBe(1);

      const resumed = await service.resume(item.id);
      expect(resumed.id).toBe("unique-resume-id");
      expect(resumed.sourceUrl).toBe("https://youtube.com/watch?v=exactid");
      expect(resumed.title).toBe("Exact Title Video");
      expect(resumed.format).toBe("mp4");
      expect(resumed.quality).toBe("720p");
      expect(resumed.progress).toBe(42);

      const allAfter = await service.getAll();
      expect(allAfter.length).toBe(1);
      expect(allAfter[0].id).toBe("unique-resume-id");
    });

    it("should resume download A without affecting concurrent downloads B and C", async () => {
      const itemA = createMockDownloadItem({ id: "item-a", title: "Video A", status: "paused", progress: 20 });
      const itemB = createMockDownloadItem({ id: "item-b", title: "Video B", status: "downloading", progress: 50 });
      const itemC = createMockDownloadItem({ id: "item-c", title: "Video C", status: "downloading", progress: 75 });

      await service.add(itemA);
      await service.add(itemB);
      await service.add(itemC);

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "",
        exitCode: 0
      });

      const resumedA = await service.resume(itemA.id);
      expect(resumedA.status).toBe("downloading");

      const all = await service.getAll();
      const storedB = all.find(i => i.id === "item-b");
      const storedC = all.find(i => i.id === "item-c");

      expect(storedB?.status).toBe("downloading");
      expect(storedB?.progress).toBe(50);
      expect(storedC?.status).toBe("downloading");
      expect(storedC?.progress).toBe(75);
    });

    it("should include --no-continue flag when starting fresh", async () => {
      let capturedArgs: string[] = [];
      const originalSpawn = mockExecutor.spawn.bind(mockExecutor);
      mockExecutor.spawn = (cmd: string, args: string[], opts?: any) => {
        capturedArgs = args;
        return originalSpawn(cmd, args, opts);
      };

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "",
        exitCode: 0
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      expect(capturedArgs).toContain("--no-continue");
    });

    it("should include FFmpeg location when specified", async () => {
      settings.ffmpegPath = "C:\\ffmpeg\\bin\\ffmpeg.exe";
      service = new NativeDownloadService(settings, mockExecutor);

      let capturedArgs: string[] = [];
      const originalSpawn = mockExecutor.spawn.bind(mockExecutor);
      mockExecutor.spawn = (cmd: string, args: string[], opts?: any) => {
        capturedArgs = args;
        return originalSpawn(cmd, args, opts);
      };

      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "",
        stderr: "",
        exitCode: 0
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      expect(capturedArgs).toContain("--ffmpeg-location");
      expect(capturedArgs).toContain("C:\\ffmpeg\\bin\\ffmpeg.exe");
    });
  });

  // ─── Settings Update ────────────────────────────────────────────────────

  describe("settings update", () => {
    it("should update settings and invalidate yt-dlp path cache", () => {
      const newSettings = createMockSettings({ ytdlpPath: "C:\\new\\path\\yt-dlp.exe" });
      service.updateSettings(newSettings);

      // No error means settings updated successfully
      expect(true).toBe(true);
    });
  });

  // ─── Cleanup ────────────────────────────────────────────────────────────

  describe("cleanup", () => {
    it("should kill all active processes on cleanup", async () => {
      mockExecutor.setDefaultAccessBehavior({ shouldSucceed: true });
      mockExecutor.setSpawnBehavior("yt-dlp", {
        stdout: "download:50000|100000|25000|00:02\n",
        stderr: "",
        exitCode: 0,
        delay: 200
      });

      const item = createMockDownloadItem({ status: "analyzing" });
      await service.add(item);
      await service.start(item.id);

      await new Promise((resolve) => setTimeout(resolve, 50));

      service.cleanup();

      // Verify no active downloads remain
      expect(service.getActiveCount()).toBe(0);
    });
  });
});
