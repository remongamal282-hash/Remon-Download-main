/**
 * NativeMetadataService Tests with yt-dlp Integration
 *
 * Tests the yt-dlp subprocess integration without requiring:
 * - Live network connection to YouTube
 * - yt-dlp binary installed on test machine
 *
 * Uses MockProcessExecutor to simulate yt-dlp behavior.
 *
 * Coverage:
 * 1. yt-dlp path resolution (Settings path, PATH fallback, not found)
 * 2. Video URL metadata parsing
 * 3. Shorts URL metadata parsing
 * 4. Playlist URL metadata parsing
 * 5. Channel URL metadata parsing
 * 6. Invalid URL error handling
 * 7. Unsupported URL error handling
 * 8. yt-dlp not found error
 * 9. Spawn failure error
 * 10. Non-zero exit code error
 * 11. Invalid JSON error
 * 12. Timeout error
 * 13. Private video error
 * 14. Video unavailable error
 * 15. Network error
 * 16. URL argument safety (no shell injection)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import { NativeMetadataService, classifyYouTubeUrl, type ProcessExecutor } from "./nativeMetadataService";

// ─── Mock Process Executor ──────────────────────────────────────────────────

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
  public spawnCalls: Array<{ command: string; args: string[]; options?: any }> = [];
  public accessCalls: Array<{ path: string; mode: number }> = [];
  private spawnBehavior: ((command: string, args: string[]) => any) | null = null;
  private accessBehavior: ((path: string, mode: number) => Promise<void>) | null = null;

  setSpawnBehavior(fn: (command: string, args: string[]) => any) {
    this.spawnBehavior = fn;
  }

  setAccessBehavior(fn: (path: string, mode: number) => Promise<void>) {
    this.accessBehavior = fn;
  }

  spawn(command: string, args: string[], options?: any): ChildProcess {
    this.spawnCalls.push({ command, args, options });

    if (this.spawnBehavior) {
      return this.spawnBehavior(command, args);
    }

    // Default: return mock process that does nothing
    return new MockChildProcess() as any;
  }

  async checkAccess(path: string, mode: number): Promise<void> {
    this.accessCalls.push({ path, mode });

    if (this.accessBehavior) {
      return this.accessBehavior(path, mode);
    }

    // Default: throw error (file not found)
    throw new Error("ENOENT");
  }

  reset() {
    this.spawnCalls = [];
    this.accessCalls = [];
    this.spawnBehavior = null;
    this.accessBehavior = null;
  }
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function createSuccessProcess(jsonOutput: string): MockChildProcess {
  const proc = new MockChildProcess();
  setImmediate(() => {
    proc.stdout.emit("data", Buffer.from(jsonOutput));
    proc.emit("exit", 0);
  });
  return proc;
}

function createErrorProcess(exitCode: number, stderrMessage: string): MockChildProcess {
  const proc = new MockChildProcess();
  setImmediate(() => {
    proc.stderr.emit("data", Buffer.from(stderrMessage));
    proc.emit("exit", exitCode);
  });
  return proc;
}

function createTimeoutProcess(): MockChildProcess {
  const proc = new MockChildProcess();
  setImmediate(() => {
    const error: any = new Error("Timeout");
    error.code = "ETIMEDOUT";
    proc.emit("error", error);
  });
  return proc;
}

function createSpawnErrorProcess(errorCode = "ENOENT"): MockChildProcess {
  const proc = new MockChildProcess();
  setImmediate(() => {
    const error: any = new Error(`spawn ${errorCode}`);
    error.code = errorCode;
    proc.emit("error", error);
  });
  return proc;
}

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const SAMPLE_VIDEO_JSON = JSON.stringify({
  id: "dQw4w9WgXcQ",
  webpage_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: "Rick Astley - Never Gonna Give You Up",
  uploader: "Rick Astley",
  duration: 212,
  view_count: 1234567890,
  thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  upload_date: "20091024",
  formats: [
    {
      format_id: "22",
      ext: "mp4",
      height: 720,
      fps: 30,
      vcodec: "avc1",
      acodec: "mp4a",
      tbr: 1500,
      abr: 128,
      filesize: 50000000
    }
  ]
});

const SAMPLE_SHORTS_JSON = JSON.stringify({
  id: "abc123xyz",
  webpage_url: "https://www.youtube.com/shorts/abc123xyz",
  title: "Amazing Short Video",
  uploader: "Content Creator",
  duration: 45,
  view_count: 98765,
  thumbnail: "https://i.ytimg.com/vi/abc123xyz/maxresdefault.jpg",
  upload_date: "20260101",
  formats: [
    {
      format_id: "18",
      ext: "mp4",
      height: 1080,
      fps: 60,
      vcodec: "avc1",
      acodec: "mp4a",
      tbr: 2000,
      abr: 192,
      filesize: 10000000
    }
  ]
});

const SAMPLE_PLAYLIST_JSON = JSON.stringify({
  id: "PLxxxxxx",
  webpage_url: "https://www.youtube.com/playlist?list=PLxxxxxx",
  title: "My Amazing Playlist",
  thumbnail: "https://i.ytimg.com/vi/playlist/maxresdefault.jpg",
  entries: [
    {
      id: "video1",
      webpage_url: "https://www.youtube.com/watch?v=video1",
      title: "Playlist Video 1",
      uploader: "Channel Name",
      duration: 300,
      view_count: 1000,
      thumbnail: "https://i.ytimg.com/vi/video1/maxresdefault.jpg",
      upload_date: "20260101",
      formats: [{ ext: "mp4", height: 720, fps: 30, vcodec: "avc1", acodec: "mp4a", tbr: 1000, abr: 128, filesize: 20000000 }]
    },
    {
      id: "video2",
      webpage_url: "https://www.youtube.com/watch?v=video2",
      title: "Playlist Video 2",
      uploader: "Channel Name",
      duration: 240,
      view_count: 2000,
      thumbnail: "https://i.ytimg.com/vi/video2/maxresdefault.jpg",
      upload_date: "20260102",
      formats: [{ ext: "mp4", height: 1080, fps: 60, vcodec: "avc1", acodec: "mp4a", tbr: 1500, abr: 192, filesize: 30000000 }]
    }
  ]
});

const SAMPLE_CHANNEL_JSON = JSON.stringify({
  id: "UCxxxxxx",
  webpage_url: "https://www.youtube.com/@ChannelName",
  title: "Channel Name",
  thumbnail: "https://i.ytimg.com/channel/thumbnail.jpg",
  entries: [
    {
      id: "latest1",
      webpage_url: "https://www.youtube.com/watch?v=latest1",
      title: "Latest Video 1",
      uploader: "Channel Name",
      duration: 600,
      view_count: 5000,
      thumbnail: "https://i.ytimg.com/vi/latest1/maxresdefault.jpg",
      upload_date: "20260110",
      formats: [{ ext: "mp4", height: 1080, fps: 30, vcodec: "avc1", acodec: "mp4a", tbr: 2000, abr: 192, filesize: 100000000 }]
    }
  ]
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("NativeMetadataService — yt-dlp Integration", () => {
  let mockExecutor: MockProcessExecutor;

  beforeEach(() => {
    mockExecutor = new MockProcessExecutor();
  });

  describe("yt-dlp path resolution", () => {
    it("uses Settings ytdlpPath if provided and valid", async () => {
      mockExecutor.setAccessBehavior(async () => { /* File exists */ });
      mockExecutor.setSpawnBehavior(() => createSuccessProcess(SAMPLE_VIDEO_JSON));

      const service = new NativeMetadataService("/custom/path/to/yt-dlp", mockExecutor);
      await service.analyze("https://www.youtube.com/watch?v=test");

      expect(mockExecutor.accessCalls).toHaveLength(1);
      expect(mockExecutor.accessCalls[0]?.path).toBe("/custom/path/to/yt-dlp");
      expect(mockExecutor.spawnCalls[0]?.command).toBe("/custom/path/to/yt-dlp");
    });

    it("uses bundled yt-dlp from process.resourcesPath before PATH", async () => {
      const previousResourcesPath = process.resourcesPath;
      Object.defineProperty(process, "resourcesPath", {
        value: "C:\\Program Files\\Remon Download\\resources",
        configurable: true
      });

      mockExecutor.setAccessBehavior(async (candidate) => {
        if (candidate.endsWith("runtime\\yt-dlp.exe")) {
          return;
        }
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior(() => createSuccessProcess(SAMPLE_VIDEO_JSON));

      try {
        const service = new NativeMetadataService(undefined, mockExecutor);
        await service.analyze("https://www.youtube.com/watch?v=test");
      } finally {
        Object.defineProperty(process, "resourcesPath", {
          value: previousResourcesPath,
          configurable: true
        });
      }

      expect(mockExecutor.spawnCalls[0]?.command).toBe(
        "C:\\Program Files\\Remon Download\\resources\\runtime\\yt-dlp.exe"
      );
      expect(mockExecutor.spawnCalls[0]?.args).toContain("--dump-single-json");
    });
    it("falls back to PATH if Settings path is invalid", async () => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        return createSuccessProcess(SAMPLE_VIDEO_JSON);
      });

      const service = new NativeMetadataService("/invalid/path", mockExecutor);
      await service.analyze("https://www.youtube.com/watch?v=test");

      expect(mockExecutor.spawnCalls[0]?.command).toBe("yt-dlp");
      expect(mockExecutor.spawnCalls[0]?.args[0]).toBe("--version");
      expect(mockExecutor.spawnCalls[1]?.command).toBe("yt-dlp");
      expect(mockExecutor.spawnCalls[1]?.args).toContain("--dump-single-json");
    });

    it("throws ytdlp_not_found if yt-dlp not in PATH", async () => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior(() => createSpawnErrorProcess("ENOENT"));

      const service = new NativeMetadataService(undefined, mockExecutor);

      await expect(service.analyze("https://www.youtube.com/watch?v=test"))
        .rejects.toThrow("ytdlp_not_found");
    });
  });

  describe("Video URL", () => {
    beforeEach(() => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        return createSuccessProcess(SAMPLE_VIDEO_JSON);
      });
    });

    it("parses video metadata correctly", async () => {
      const service = new NativeMetadataService(undefined, mockExecutor);
      const result = await service.analyze("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

      expect(result.linkType).toBe("video");
      expect((result as any).title).toBe("Rick Astley - Never Gonna Give You Up");
      expect(result).toMatchObject({
        linkType: "video",
        channelName: "Rick Astley",
        duration: "3:32",
        views: 1234567890,
        resolution: "720p",
        fps: 30
      });
    });

    it("passes URL as separate argument (security)", async () => {
      const service = new NativeMetadataService(undefined, mockExecutor);
      const maliciousUrl = "https://www.youtube.com/watch?v=test; rm -rf /";

      await service.analyze(maliciousUrl);

      const metadataCall = mockExecutor.spawnCalls.find(call =>
        call.args.includes("--dump-single-json")
      );

      expect(metadataCall?.args).toContain(maliciousUrl);
      expect(metadataCall?.options?.windowsHide).toBe(true);
    });

    it("shares concurrent analysis requests for the same URL", async () => {
      const service = new NativeMetadataService(undefined, mockExecutor);
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

      const [first, second] = await Promise.all([
        service.analyze(url),
        service.analyze(url)
      ]);

      expect(first).toEqual(second);
      expect(mockExecutor.spawnCalls.filter((call) => call.args.includes("--dump-single-json"))).toHaveLength(1);
    });
  });

  describe("Shorts URL", () => {
    beforeEach(() => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        return createSuccessProcess(SAMPLE_SHORTS_JSON);
      });
    });

    it("parses shorts metadata correctly", async () => {
      const service = new NativeMetadataService(undefined, mockExecutor);
      const result = await service.analyze("https://www.youtube.com/shorts/abc123xyz");

      expect(result.linkType).toBe("shorts");
      expect((result as any).title).toBe("Amazing Short Video");
      expect(result).toMatchObject({
        linkType: "shorts",
        duration: "0:45"
      });
    });
  });

  describe("Playlist URL", () => {
    beforeEach(() => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        return createSuccessProcess(SAMPLE_PLAYLIST_JSON);
      });
    });

    it("parses playlist metadata with video entries", async () => {
      const service = new NativeMetadataService(undefined, mockExecutor);
      const result = await service.analyze("https://www.youtube.com/playlist?list=PLxxxxxx");

      expect(result.linkType).toBe("playlist");
      if (result.linkType === "playlist") {
        expect(result.title).toBe("My Amazing Playlist");
        expect(result.videos).toHaveLength(2);
        expect(result.videos[0]?.title).toBe("Playlist Video 1");
        expect(result.videos[0]?.linkType).toBe("playlist-video");
        expect(result.videos[0]?.sourceUrl).toBe("https://www.youtube.com/watch?v=video1");
      }
    });

    it("uses --yes-playlist flag for playlists", async () => {
      const service = new NativeMetadataService(undefined, mockExecutor);
      await service.analyze("https://www.youtube.com/playlist?list=PLxxxxxx");

      const metadataCall = mockExecutor.spawnCalls.find(call =>
        call.args.includes("--dump-single-json")
      );

      expect(metadataCall?.args).toContain("--yes-playlist");
      expect(metadataCall?.args).toContain("--flat-playlist");
    });
  });

  it("derives a YouTube thumbnail when a playlist entry has no thumbnail", async () => {
    mockExecutor.setSpawnBehavior(() => createSuccessProcess(JSON.stringify({
      id: "PLxxxxxx",
      title: "Playlist",
      entries: [{ id: "video-without-thumbnail", title: "Video" }]
    })));
    mockExecutor.setAccessBehavior(async () => { /* File exists */ });

    const service = new NativeMetadataService("yt-dlp", mockExecutor);
    const result = await service.analyze("https://www.youtube.com/playlist?list=PLxxxxxx");

    expect(result.linkType).toBe("playlist");
    if (result.linkType === "playlist") {
      expect(result.videos[0]?.thumbnail).toBe("https://i.ytimg.com/vi/video-without-thumbnail/hqdefault.jpg");
    }
  });

  describe("Channel URL", () => {
    beforeEach(() => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        return createSuccessProcess(SAMPLE_CHANNEL_JSON);
      });
    });

    it("parses channel metadata with latest videos", async () => {
      const service = new NativeMetadataService(undefined, mockExecutor);
      const result = await service.analyze("https://www.youtube.com/@ChannelName");

      expect(result.linkType).toBe("channel");
      if (result.linkType === "channel") {
        expect(result.name).toBe("Channel Name");
        expect(result.latestVideos).toHaveLength(1);
        expect(result.latestVideos[0]?.title).toBe("Latest Video 1");
      }
    });
  });

  describe("Error handling", () => {
    it("throws invalid_url for empty string", async () => {
      const service = new NativeMetadataService(undefined, mockExecutor);
      await expect(service.analyze("")).rejects.toThrow("invalid_url");
    });

    it("throws invalid_url for non-URL string", async () => {
      const service = new NativeMetadataService(undefined, mockExecutor);
      await expect(service.analyze("not-a-url")).rejects.toThrow("invalid_url");
    });

    it("throws unsupported_url for non-YouTube URL", async () => {
      const service = new NativeMetadataService(undefined, mockExecutor);
      await expect(service.analyze("https://vimeo.com/123456")).rejects.toThrow("unsupported_url");
    });

    it("throws video_unavailable on yt-dlp unavailable error", async () => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        return createErrorProcess(1, "ERROR: Video unavailable");
      });

      const service = new NativeMetadataService(undefined, mockExecutor);
      await expect(service.analyze("https://www.youtube.com/watch?v=unavailable"))
        .rejects.toThrow("video_unavailable");
    });

    it("throws video_private on yt-dlp private video error", async () => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        return createErrorProcess(1, "ERROR: This is a private video");
      });

      const service = new NativeMetadataService(undefined, mockExecutor);
      await expect(service.analyze("https://www.youtube.com/watch?v=private"))
        .rejects.toThrow("video_private");
    });

    it("throws network_error on yt-dlp network failure", async () => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        return createErrorProcess(1, "ERROR: Unable to connect to server. Network error");
      });

      const service = new NativeMetadataService(undefined, mockExecutor);
      await expect(service.analyze("https://www.youtube.com/watch?v=test"))
        .rejects.toThrow("network_error");
    });

    it("throws ytdlp_invalid_json on malformed JSON output", async () => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        const proc = new MockChildProcess();
        setImmediate(() => {
          proc.stdout.emit("data", Buffer.from("{ invalid json"));
          proc.emit("exit", 0);
        });
        return proc as any;
      });

      const service = new NativeMetadataService(undefined, mockExecutor);
      await expect(service.analyze("https://www.youtube.com/watch?v=test"))
        .rejects.toThrow("ytdlp_invalid_json");
    });

    it("throws ytdlp_timeout on process timeout", async () => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        return createTimeoutProcess();
      });

      const service = new NativeMetadataService(undefined, mockExecutor);
      await expect(service.analyze("https://www.youtube.com/watch?v=test"))
        .rejects.toThrow("ytdlp_timeout");
    });

    it("throws ytdlp_spawn_failed on spawn error", async () => {
      mockExecutor.setAccessBehavior(async () => {
        throw new Error("ENOENT");
      });
      mockExecutor.setSpawnBehavior((cmd, args) => {
        if (args[0] === "--version") {
          return createSuccessProcess("2024.01.01");
        }
        return createSpawnErrorProcess("EPERM");
      });

      const service = new NativeMetadataService(undefined, mockExecutor);
      await expect(service.analyze("https://www.youtube.com/watch?v=test"))
        .rejects.toThrow("ytdlp_spawn_failed");
    });
  });

  describe("URL classification (no yt-dlp call)", () => {
    it("classifies /shorts/ URLs correctly", () => {
      expect(classifyYouTubeUrl("https://www.youtube.com/shorts/abc123")).toBe("shorts");
    });

    it("classifies /channel/ URLs correctly", () => {
      expect(classifyYouTubeUrl("https://www.youtube.com/channel/UC123")).toBe("channel");
    });

    it("classifies /@handle URLs correctly", () => {
      expect(classifyYouTubeUrl("https://www.youtube.com/@ChannelName")).toBe("channel");
    });

    it("classifies playlist URLs correctly", () => {
      expect(classifyYouTubeUrl("https://www.youtube.com/playlist?list=PLxxx")).toBe("playlist");
    });

    it("classifies playlist-video URLs correctly", () => {
      expect(classifyYouTubeUrl("https://www.youtube.com/watch?v=abc&list=PLxxx")).toBe("playlist-video");
    });

    it("classifies regular video URLs correctly", () => {
      expect(classifyYouTubeUrl("https://www.youtube.com/watch?v=abc123")).toBe("video");
    });
  });
});
