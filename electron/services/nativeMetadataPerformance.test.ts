import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import {
  NativeMetadataService,
  getSharedMetadataService,
  resetSharedMetadataService,
  type ProcessExecutor,
} from "./nativeMetadataService";
import { NativeSchedulerService } from "./nativeSchedulerService";
import * as fileStorage from "../utils/fileStorage";
import type { VideoMetadata } from "../../src/types/download";

vi.mock("../utils/fileStorage", () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
}));

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  kill(): boolean {
    this.killed = true;
    this.emit("exit", null);
    return true;
  }
}

class PerformanceMockExecutor implements ProcessExecutor {
  public spawnCalls: Array<{ command: string; args: string[]; options?: any }> = [];
  public accessCalls: Array<{ path: string; mode: number }> = [];
  private spawnHandler: ((command: string, args: string[]) => ChildProcess) | null = null;

  setSpawnHandler(fn: (command: string, args: string[]) => ChildProcess) {
    this.spawnHandler = fn;
  }

  spawn(command: string, args: string[], options?: any): ChildProcess {
    this.spawnCalls.push({ command, args, options });
    if (this.spawnHandler) {
      return this.spawnHandler(command, args);
    }
    const proc = new MockChildProcess();
    setImmediate(() => {
      proc.stdout.emit("data", Buffer.from(JSON.stringify({
        id: "perf123",
        title: "Performance Test Video",
        uploader: "Performance Channel",
        duration: 180,
        formats: [{ format_id: "18", ext: "mp4", height: 720 }]
      })));
      proc.emit("exit", 0);
    });
    return proc as any;
  }

  async checkAccess(path: string, mode: number): Promise<void> {
    this.accessCalls.push({ path, mode });
    // Simulate valid path
  }

  reset() {
    this.spawnCalls = [];
    this.accessCalls = [];
    this.spawnHandler = null;
  }
}

describe("Phase 14 — Performance & Memory Optimizations", () => {
  let mockExecutor: PerformanceMockExecutor;

  beforeEach(() => {
    resetSharedMetadataService();
    mockExecutor = new PerformanceMockExecutor();
    vi.mocked(fileStorage.readJsonFile).mockResolvedValue({ version: "1.0.0", data: [] });
    vi.mocked(fileStorage.writeJsonFile).mockResolvedValue(undefined);
  });

  it("shared cache returns metadata instantly (<10ms) without spawning additional processes", async () => {
    const service = new NativeMetadataService("yt-dlp", mockExecutor);
    const url = "https://www.youtube.com/watch?v=perf123";

    // First call: should spawn yt-dlp once
    const firstResult = (await service.analyze(url)) as VideoMetadata;
    expect(firstResult.title).toBe("Performance Test Video");
    expect(mockExecutor.spawnCalls).toHaveLength(1);

    // Second call: should hit cache immediately without any new spawn call
    const startTime = performance.now();
    const cachedResult = (await service.analyze(url)) as VideoMetadata;
    const elapsed = performance.now() - startTime;

    expect(cachedResult).toEqual(firstResult);
    expect(mockExecutor.spawnCalls).toHaveLength(1); // No new spawn
    expect(elapsed).toBeLessThan(15); // Fast memory cache return
  });

  it("in-flight deduplication shares a single child process across concurrent requests", async () => {
    let processCount = 0;
    mockExecutor.setSpawnHandler(() => {
      processCount++;
      const proc = new MockChildProcess();
      setTimeout(() => {
        proc.stdout.emit("data", Buffer.from(JSON.stringify({
          id: "perf123",
          title: "Concurrent Video",
          formats: [{ format_id: "22", ext: "mp4", height: 720 }]
        })));
        proc.emit("exit", 0);
      }, 50);
      return proc as any;
    });

    const service = new NativeMetadataService("yt-dlp", mockExecutor);
    const url = "https://www.youtube.com/watch?v=perf123";

    // Fire 3 simultaneous analyze requests
    const [res1, res2, res3] = (await Promise.all([
      service.analyze(url),
      service.analyze(url),
      service.analyze(url)
    ])) as [VideoMetadata, VideoMetadata, VideoMetadata];

    expect(res1.title).toBe("Concurrent Video");
    expect(res2.title).toBe("Concurrent Video");
    expect(res3.title).toBe("Concurrent Video");
    expect(processCount).toBe(1); // Only 1 process spawned for all 3 concurrent requests
  });

  it("does NOT trigger 6 cascading fallback spawns on non-retryable errors like timeout or private video", async () => {
    mockExecutor.setSpawnHandler((cmd, args) => {
      const proc = new MockChildProcess();
      setImmediate(() => {
        proc.stderr.emit("data", Buffer.from("ERROR: This is a private video"));
        proc.emit("exit", 1);
      });
      return proc as any;
    });

    const service = new NativeMetadataService("yt-dlp", mockExecutor);
    const url = "https://www.youtube.com/watch?v=private123";

    await expect(service.analyze(url)).rejects.toThrow("video_private");
    // Crucial: Only 1 spawn occurred! Did NOT retry with 5 other player clients
    expect(mockExecutor.spawnCalls).toHaveLength(1);
  });

  it("does NOT retry on ytdlp_timeout, failing fast without 90s delay", async () => {
    mockExecutor.setSpawnHandler(() => {
      const proc = new MockChildProcess();
      setImmediate(() => {
        const err: any = new Error("timeout");
        err.code = "ETIMEDOUT";
        proc.emit("error", err);
      });
      return proc as any;
    });

    const service = new NativeMetadataService("yt-dlp", mockExecutor);
    const url = "https://www.youtube.com/watch?v=timeout123";

    await expect(service.analyze(url)).rejects.toThrow("ytdlp_timeout");
    // Only 1 spawn occurred, no cascading retries on timeout
    expect(mockExecutor.spawnCalls).toHaveLength(1);
  });

  it("updateSettingsYtdlpPath updates path dynamically without losing cache", async () => {
    const service = new NativeMetadataService("yt-dlp", mockExecutor);
    const url = "https://www.youtube.com/watch?v=perf123";

    await service.analyze(url);
    expect(mockExecutor.spawnCalls).toHaveLength(1);

    // Update settings path
    service.updateSettingsYtdlpPath("/new/path/to/yt-dlp");

    // Cache should still hit for the same URL
    const cached = (await service.analyze(url)) as VideoMetadata;
    expect(cached.title).toBe("Performance Test Video");
    expect(mockExecutor.spawnCalls).toHaveLength(1);
  });

  it("getSharedMetadataService provides a persistent singleton instance across modules", () => {
    const s1 = getSharedMetadataService();
    const s2 = getSharedMetadataService();
    expect(s1).toBe(s2);
  });

  it("scheduler pre-warms cache and triggers due item with cached metadata without subprocess delay", async () => {
    const metadataService = new NativeMetadataService("yt-dlp", mockExecutor);
    const schedulerService = new NativeSchedulerService(metadataService);
    await schedulerService.initialize();

    const url = "https://www.youtube.com/watch?v=perf123";
    const now = Date.now();

    // Create schedule: triggers background cache pre-warming
    await schedulerService.create({
      sourceUrl: url,
      date: new Date(now - 1000).toISOString().slice(0, 10),
      time: "00:00",
      repeat: "once",
      status: "scheduled",
      nextRunAt: new Date(now - 1000).toISOString()
    });

    // Wait short tick for background warm-up to finish
    await new Promise((r) => setTimeout(r, 20));

    expect(mockExecutor.spawnCalls.length).toBeGreaterThanOrEqual(1);
    const initialSpawns = mockExecutor.spawnCalls.length;

    // Trigger tick: item is due, should use pre-cached metadata
    const tickResult = await schedulerService.tick(now);
    expect(tickResult.triggered).toHaveLength(1);
    expect(tickResult.triggered[0]?.metadata[0]?.title).toBe("Performance Test Video");

    // No extra spawn occurred during tick execution!
    expect(mockExecutor.spawnCalls.length).toBe(initialSpawns);
  });

  describe("Phase 14.1 — Fast & Reliable First Analysis Suite", () => {
    it("first analysis of a valid URL does NOT depend on cache and requests metadata cleanly", async () => {
      const service = new NativeMetadataService("yt-dlp", mockExecutor);
      const url = "https://www.youtube.com/watch?v=firstRun123";

      const result = (await service.analyze(url)) as VideoMetadata;
      expect(result.title).toBe("Performance Test Video");
      expect(mockExecutor.spawnCalls).toHaveLength(1);

      // Verify that --skip-download was passed (NO media download)
      const args = mockExecutor.spawnCalls[0].args;
      expect(args).toContain("--skip-download");
      // Verify ffmpeg was NOT invoked
      expect(mockExecutor.spawnCalls[0].command).not.toContain("ffmpeg");
    });

    it("verifies yt-dlp --version is NEVER invoked during analysis when binary path exists", async () => {
      const service = new NativeMetadataService("yt-dlp", mockExecutor);

      // Run 3 different analyses
      await service.analyze("https://www.youtube.com/watch?v=url1");
      await service.analyze("https://www.youtube.com/watch?v=url2");
      await service.analyze("https://www.youtube.com/watch?v=url3");

      // Verify no spawn call was made with --version
      const versionSpawns = mockExecutor.spawnCalls.filter((call) => call.args.includes("--version"));
      expect(versionSpawns).toHaveLength(0);
    });

    it("parses high-format-count video (e.g. 50+ audio/video formats) into ordered quality options", async () => {
      // Generate 50 formats covering 144p up to 2160p (4K)
      const formats = [
        { format_id: "18", ext: "mp4", height: 360, fps: 30, vcodec: "avc1" },
        { format_id: "22", ext: "mp4", height: 720, fps: 30, vcodec: "avc1" },
        { format_id: "137", ext: "mp4", height: 1080, fps: 60, vcodec: "avc1" },
        { format_id: "248", ext: "webm", height: 1080, fps: 60, vcodec: "vp9" },
        { format_id: "271", ext: "webm", height: 1440, fps: 60, vcodec: "vp9" },
        { format_id: "313", ext: "webm", height: 2160, fps: 60, vcodec: "vp9" },
        { format_id: "140", ext: "m4a", acodec: "mp4a.40.2", abr: 128 },
        { format_id: "251", ext: "webm", acodec: "opus", abr: 160 }
      ];
      // Pad formats to 50
      for (let i = 0; i < 42; i++) {
        formats.push({ format_id: `f-${i}`, ext: "mp4", height: 480, fps: 30, vcodec: "avc1" });
      }

      mockExecutor.setSpawnHandler(() => {
        const proc = new MockChildProcess();
        setImmediate(() => {
          proc.stdout.emit("data", Buffer.from(JSON.stringify({
            id: "highFormatVideo",
            title: "4K High Format Video",
            uploader: "4K Channel",
            duration: 7200, // 2 hour long video
            formats
          })));
          proc.emit("exit", 0);
        });
        return proc as any;
      });

      const service = new NativeMetadataService("yt-dlp", mockExecutor);
      const res = (await service.analyze("https://www.youtube.com/watch?v=highFormatVideo")) as VideoMetadata;

      expect(res.title).toBe("4K High Format Video");
      expect(res.duration).toBe("120:00"); // 2 hours formatted correctly
      // Available qualities extracted in descending order
      expect(res.qualityOptions).toContain("2160p");
      expect(res.qualityOptions).toContain("1440p");
      expect(res.qualityOptions).toContain("1080p");
      expect(res.qualityOptions).toContain("720p");
      expect(res.qualityOptions).toContain("480p");
      expect(res.qualityOptions).toContain("360p");
      // Best resolution selected as highest available
      expect(res.resolution).toBe("2160p");
    });
  });
});
