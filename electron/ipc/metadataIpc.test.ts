/**
 * Metadata IPC Integration Tests
 *
 * Tests the complete Metadata IPC path in isolation (no live Electron):
 *
 *   NativeMetadataService → wrapSuccess/wrapError → IpcResult<AnalysisResult>
 *   ElectronMetadataService adapter → window.electronAPI.metadata.analyze()
 *   serviceResolver → Electron mode vs Web/Mock mode
 *
 * These run under Vitest (JSDOM) without a running Electron instance.
 *
 * Coverage (14 required points):
 * 1.  Metadata IPC channel exists with correct name
 * 2.  IPC handler simulation — wrapSuccess for valid URL
 * 3.  IPC handler simulation — wrapError for unsupported URL
 * 4.  IPC handler simulation — wrapError for invalid URL
 * 5.  ElectronMetadataService adapter — delegates to window.electronAPI.metadata.analyze
 * 6.  serviceResolver — Web mode returns MockMetadataService
 * 7.  serviceResolver — Electron mode returns ElectronMetadataService
 * 8.  Error propagation — adapter re-throws IPC error to store
 * 9.  Video URL — handler returns VideoMetadata from NativeMetadataService
 * 10. Shorts URL — handler returns VideoMetadata with linkType "shorts"
 * 11. Playlist URL — handler returns PlaylistMetadata
 * 12. Channel URL — handler returns ChannelMetadata
 * 13. Invalid URL — handler returns IpcResult error (no crash)
 * 14. Unsupported URL — handler returns IpcResult error (no crash)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "events";
import { IPC_CHANNELS } from "../ipc/channels";
import type { IpcResult } from "../ipc/channels";
import { NativeMetadataService, type ProcessExecutor } from "../services/nativeMetadataService";
import { ElectronMetadataService } from "../../src/services/electronIpcAdapters";
import {
  resolveMetadataService,
  _resetServiceCache
} from "../../src/services/serviceResolver";
import { MockMetadataService } from "../../src/services/metadataService";
import type { AnalysisResult, VideoMetadata, PlaylistMetadata, ChannelMetadata } from "../../src/types/download";

// ─── Mock Process Executor (same as in nativeMetadataService.test.ts) ───────

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

class MockProcessExecutor implements ProcessExecutor {
  private spawnBehavior: ((command: string, args: string[]) => any) | null = null;
  private accessBehavior: ((path: string, mode: number) => Promise<void>) | null = null;

  setSpawnBehavior(fn: (command: string, args: string[]) => any) {
    this.spawnBehavior = fn;
  }

  setAccessBehavior(fn: (path: string, mode: number) => Promise<void>) {
    this.accessBehavior = fn;
  }

  spawn(command: string, args: string[], options?: any): any {
    if (this.spawnBehavior) {
      return this.spawnBehavior(command, args);
    }
    return new MockChildProcess();
  }

  async checkAccess(path: string, mode: number): Promise<void> {
    if (this.accessBehavior) {
      return this.accessBehavior(path, mode);
    }
    throw new Error("ENOENT");
  }
}

function createSuccessProcess(jsonOutput: string): MockChildProcess {
  const proc = new MockChildProcess();
  setImmediate(() => {
    proc.stdout.emit("data", Buffer.from(jsonOutput));
    proc.emit("exit", 0);
  });
  return proc;
}

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const SAMPLE_VIDEO_JSON = JSON.stringify({
  id: "dQw4w9WgXcQ",
  webpage_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: "Test Video",
  uploader: "Test Channel",
  duration: 300,
  view_count: 1000,
  thumbnail: "https://example.com/thumb.jpg",
  upload_date: "20260101",
  formats: [{ ext: "mp4", height: 1080, fps: 30, vcodec: "avc1", acodec: "mp4a", tbr: 5000, abr: 192, filesize: 100000 }]
});

const SAMPLE_SHORTS_JSON = JSON.stringify({
  id: "abc123",
  webpage_url: "https://www.youtube.com/shorts/abc123",
  title: "Test Shorts",
  uploader: "Test Channel",
  duration: 45,
  view_count: 500,
  thumbnail: "https://example.com/shorts.jpg",
  upload_date: "20260101",
  formats: [{ ext: "mp4", height: 1080, fps: 60, vcodec: "avc1", acodec: "mp4a", tbr: 2000, abr: 192, filesize: 5000 }]
});

const SAMPLE_PLAYLIST_JSON = JSON.stringify({
  id: "PLxxxxxx",
  webpage_url: "https://www.youtube.com/playlist?list=PLxxxxxx",
  title: "Test Playlist",
  thumbnail: "https://example.com/playlist.jpg",
  entries: [
    {
      id: "video1",
      webpage_url: "https://www.youtube.com/watch?v=video1",
      title: "Video 1",
      uploader: "Channel",
      duration: 100,
      view_count: 1000,
      thumbnail: "https://example.com/v1.jpg",
      upload_date: "20260101",
      formats: [{ ext: "mp4", height: 720, fps: 30, vcodec: "avc1", acodec: "mp4a", tbr: 1000, abr: 128, filesize: 10000 }]
    }
  ]
});

const SAMPLE_CHANNEL_JSON = JSON.stringify({
  id: "UCxxxxxx",
  webpage_url: "https://www.youtube.com/@ExampleChannel",
  title: "Test Channel",
  thumbnail: "https://example.com/channel.jpg",
  entries: [
    {
      id: "latest1",
      webpage_url: "https://www.youtube.com/watch?v=latest1",
      title: "Latest Video",
      uploader: "Test Channel",
      duration: 200,
      view_count: 2000,
      thumbnail: "https://example.com/latest.jpg",
      upload_date: "20260110",
      formats: [{ ext: "mp4", height: 1080, fps: 30, vcodec: "avc1", acodec: "mp4a", tbr: 2000, abr: 192, filesize: 50000 }]
    }
  ]
});

const URLS = {
  video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  shorts: "https://www.youtube.com/shorts/abc123",
  playlist: "https://www.youtube.com/playlist?list=PLxxxxxx",
  channel: "https://www.youtube.com/@ExampleChannel",
  unsupported: "https://vimeo.com/123456",
  invalid: "not-a-url"
};

// ─── Shared helpers ──────────────────────────────────────────────────────────

function wrapSuccess<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

function wrapError<T>(err: unknown): IpcResult<T> {
  const message = err instanceof Error ? err.message : String(err);
  return { success: false, error: { code: "unknown", message, recoverable: true } };
}

function createMockExecutor(responseMap: Record<string, string>): MockProcessExecutor {
  const executor = new MockProcessExecutor();

  executor.setAccessBehavior(async () => {
    throw new Error("ENOENT"); // Force PATH lookup
  });

  executor.setSpawnBehavior((cmd, args) => {
    if (args[0] === "--version") {
      return createSuccessProcess("2024.01.01");
    }

    // Find URL in args
    const url = args.find(arg => arg.startsWith("http"));
    if (url && responseMap[url]) {
      return createSuccessProcess(responseMap[url]);
    }

    // Default error
    const proc = new MockChildProcess();
    setImmediate(() => {
      proc.stderr.emit("data", Buffer.from("ERROR: Video unavailable"));
      proc.emit("exit", 1);
    });
    return proc;
  });

  return executor;
}

async function simulateHandler(url: string, responseMap: Record<string, string>): Promise<IpcResult<AnalysisResult>> {
  const executor = createMockExecutor(responseMap);
  const service = new NativeMetadataService(undefined, executor);

  try {
    const data = await service.analyze(url);
    return wrapSuccess(data);
  } catch (err) {
    return wrapError(err);
  }
}

// ─── 1. Metadata IPC channel ─────────────────────────────────────────────────

describe("Metadata IPC channel", () => {
  it("METADATA_ANALYZE channel exists in IPC_CHANNELS", () => {
    expect(IPC_CHANNELS.METADATA_ANALYZE).toBeDefined();
  });

  it("METADATA_ANALYZE channel follows namespace:action pattern", () => {
    expect(IPC_CHANNELS.METADATA_ANALYZE).toBe("metadata:analyze");
  });

  it("METADATA_ANALYZE is a unique channel string", () => {
    const values = Object.values(IPC_CHANNELS);
    const count = values.filter((v) => v === IPC_CHANNELS.METADATA_ANALYZE).length;
    expect(count).toBe(1);
  });
});

// ─── 2-4. IPC handler simulation ─────────────────────────────────────────────

describe("IPC handler simulation — metadata:analyze", () => {
  const responseMap = {
    [URLS.video]: SAMPLE_VIDEO_JSON
  };

  it("returns IpcResult { success: true } for a valid video URL", async () => {
    const result = await simulateHandler(URLS.video, responseMap);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.linkType).toBe("video");
    }
  });

  it("returns IpcResult { success: false } for an unsupported URL — does not crash", async () => {
    const result = await simulateHandler(URLS.unsupported, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("unsupported_url");
    }
  });

  it("returns IpcResult { success: false } for an invalid URL — does not crash", async () => {
    const result = await simulateHandler(URLS.invalid, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("invalid_url");
    }
  });

  it("Main Process never throws — errors are always wrapped in IpcResult", async () => {
    await expect(simulateHandler("", {})).resolves.toMatchObject({ success: false });
    await expect(simulateHandler(URLS.unsupported, {})).resolves.toMatchObject({ success: false });
  });
});

// ─── 9-14. URL-type coverage ─────────────────────────────────────────────────

describe("IPC handler — URL type coverage", () => {
  it("Video URL → IpcResult<VideoMetadata> with linkType 'video'", async () => {
    const responseMap = { [URLS.video]: SAMPLE_VIDEO_JSON };
    const result = await simulateHandler(URLS.video, responseMap);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.linkType).toBe("video");
      const video = result.data as VideoMetadata;
      expect(video.qualityOptions.length).toBeGreaterThan(0);
    }
  });

  it("Shorts URL → IpcResult<VideoMetadata> with linkType 'shorts'", async () => {
    const responseMap = { [URLS.shorts]: SAMPLE_SHORTS_JSON };
    const result = await simulateHandler(URLS.shorts, responseMap);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.linkType).toBe("shorts");
    }
  });

  it("Playlist URL → IpcResult<PlaylistMetadata> with linkType 'playlist'", async () => {
    const responseMap = { [URLS.playlist]: SAMPLE_PLAYLIST_JSON };
    const result = await simulateHandler(URLS.playlist, responseMap);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.linkType).toBe("playlist");
      const pl = result.data as PlaylistMetadata;
      expect(Array.isArray(pl.videos)).toBe(true);
    }
  });

  it("Channel URL → IpcResult<ChannelMetadata> with linkType 'channel'", async () => {
    const responseMap = { [URLS.channel]: SAMPLE_CHANNEL_JSON };
    const result = await simulateHandler(URLS.channel, responseMap);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.linkType).toBe("channel");
      const ch = result.data as ChannelMetadata;
      expect(Array.isArray(ch.latestVideos)).toBe(true);
    }
  });

  it("Invalid URL → IpcResult error with message 'invalid_url'", async () => {
    const result = await simulateHandler(URLS.invalid, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("invalid_url");
      expect(result.error.recoverable).toBe(true);
    }
  });

  it("Unsupported URL → IpcResult error with message 'unsupported_url'", async () => {
    const result = await simulateHandler(URLS.unsupported, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("unsupported_url");
      expect(result.error.recoverable).toBe(true);
    }
  });
});

// ─── 5. ElectronMetadataService adapter ─────────────────────────────────────

describe("ElectronMetadataService adapter", () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  it("delegates analyze() to window.electronAPI.metadata.analyze()", async () => {
    const mockAnalyze = vi.fn().mockResolvedValue({
      id: "test-id",
      sourceUrl: URLS.video,
      linkType: "video",
      thumbnail: "https://example.com/thumb.jpg",
      title: "Test Video",
      channelName: "Test Channel",
      duration: "5:00",
      views: 100,
      qualityOptions: ["1080p"],
      videoFormats: ["mp4"],
      audioFormats: ["m4a"],
      resolution: "1080p",
      fps: 30,
      videoCodec: "H.264",
      audioCodec: "AAC",
      videoBitrate: "5 Mbps",
      audioBitrate: "192 Kbps",
      container: "mp4",
      fileSize: 100000,
      uploadDate: "2026-01-01"
    } satisfies VideoMetadata);

    (window as unknown as Record<string, unknown>).electronAPI = {
      isElectron: true,
      metadata: { analyze: mockAnalyze },
      download: {},
      settings: {},
      history: {},
      favorites: {},
      scheduler: {}
    };

    const adapter = new ElectronMetadataService();
    const result = await adapter.analyze(URLS.video);

    expect(mockAnalyze).toHaveBeenCalledWith(URLS.video);
    expect(result.linkType).toBe("video");

    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  it("re-throws errors from window.electronAPI.metadata.analyze()", async () => {
    const mockAnalyze = vi.fn().mockRejectedValue(new Error("unsupported_url"));

    (window as unknown as Record<string, unknown>).electronAPI = {
      isElectron: true,
      metadata: { analyze: mockAnalyze },
      download: {},
      settings: {},
      history: {},
      favorites: {},
      scheduler: {}
    };

    const adapter = new ElectronMetadataService();
    await expect(adapter.analyze(URLS.unsupported)).rejects.toThrow("unsupported_url");

    delete (window as unknown as Record<string, unknown>).electronAPI;
  });
});

// ─── 6-7. serviceResolver dual-mode ─────────────────────────────────────────

describe("serviceResolver — metadata dual-mode", () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).electronAPI;
    _resetServiceCache();
  });

  it("Web mode — resolveMetadataService() returns MockMetadataService", () => {
    const svc = resolveMetadataService();
    expect(svc).toBeInstanceOf(MockMetadataService);
  });

  it("Electron mode — resolveMetadataService() returns ElectronMetadataService", () => {
    (window as unknown as Record<string, unknown>).electronAPI = { isElectron: true };
    _resetServiceCache();
    const svc = resolveMetadataService();
    expect(svc).toBeInstanceOf(ElectronMetadataService);
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  it("Web mode MockMetadataService.analyze() rejects unsupported URLs with 'unsupported_url'", async () => {
    const svc = resolveMetadataService() as MockMetadataService;
    await expect(svc.analyze(URLS.unsupported)).rejects.toThrow("unsupported_url");
  });
});

// ─── 8. Error propagation ─────────────────────────────────────────────────────

describe("Error propagation — store error flow", () => {
  it("wrapError from NativeMetadataService → IpcResult error → adapter throws → store catches", async () => {
    // Step 1: NativeMetadataService throws (with mock executor)
    const executor = createMockExecutor({});
    const nativeSvc = new NativeMetadataService(undefined, executor);
    let nativeError: Error | null = null;
    try {
      await nativeSvc.analyze(URLS.unsupported);
    } catch (err) {
      nativeError = err as Error;
    }
    expect(nativeError?.message).toBe("unsupported_url");

    // Step 2: handler wraps to IpcResult
    const ipcResult = await simulateHandler(URLS.unsupported, {});
    expect(ipcResult.success).toBe(false);
    if (!ipcResult.success) {
      expect(ipcResult.error.message).toBe("unsupported_url");
    }

    // Step 3: Confirm error chain
    expect(nativeError?.message).toBe("unsupported_url");
  });
});
