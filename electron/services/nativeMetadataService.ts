/**
 * NativeMetadataService — Main Process metadata via yt-dlp.
 *
 * Phase 2.x: Real yt-dlp integration for production metadata fetching.
 *
 * What this does:
 * - Validates YouTube URLs (youtube.com / youtu.be).
 * - Classifies link type: video | shorts | playlist | playlist-video | channel.
 * - Invokes yt-dlp as child_process to fetch real metadata from YouTube.
 * - Parses yt-dlp JSON output into AnalysisResult types.
 * - Handles errors, timeouts, and process failures safely.
 *
 * yt-dlp Path Resolution:
 * 1. Settings ytdlpPath (if provided and valid)
 * 2. System PATH lookup (via 'which' command or direct spawn attempt)
 * 3. Error if not found
 *
 * Security:
 * - URL passed as separate argument (no shell concatenation)
 * - No shell=true (uses spawn with argument array)
 * - No arbitrary command execution
 *
 * Testability:
 * - Uses dependency injection for spawn/access functions
 * - Allows mocking without complex vi.mock() setup
 *
 * Relationship to MockMetadataService:
 * - MockMetadataService runs in Web/Vitest mode (Renderer, uses window.setTimeout)
 * - NativeMetadataService runs in Electron Main Process (Node.js, spawns yt-dlp)
 * - URL classification logic duplicated intentionally (process isolation)
 */

import { spawn as nodeSpawn, type ChildProcess } from "child_process";
import { access as fsAccess, constants as fsConstants } from "fs/promises";
import * as path from "path";
import type {
  AnalysisResult,
  ChannelMetadata,
  LinkType,
  PlaylistMetadata,
  VideoMetadata,
  VideoLinkType
} from "../../src/types/download";

// ─── Configuration ──────────────────────────────────────────────────────────

const YTDLP_TIMEOUT_MS = 60000; // 60 seconds - realistic ceiling for Windows Python startup + format extraction
const PLAYLIST_TIMEOUT_MS = 120000; // 120 seconds - playlists take longer
const YOUTUBE_HOSTNAMES = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be"
]);

// Phase 14.1: System PATH candidates — checked by file existence only, no --version spawn.
const SYSTEM_PATH_CANDIDATES = ["yt-dlp.exe", "yt-dlp", "youtube-dl.exe", "youtube-dl"];

// ─── Simple LRU Cache for Metadata ──────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class MetadataCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 50, ttlMs = 1000 * 60 * 60) {
    // Default: 50 items, 1 hour TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

// ─── Process Executor Interface (for Dependency Injection) ─────────────────

export interface ProcessExecutor {
  spawn(command: string, args: string[], options?: any): ChildProcess;
  checkAccess(path: string, mode: number): Promise<void>;
}

class DefaultProcessExecutor implements ProcessExecutor {
  spawn(command: string, args: string[], options?: any): ChildProcess {
    return nodeSpawn(command, args, options);
  }

  async checkAccess(path: string, mode: number): Promise<void> {
    return fsAccess(path, mode);
  }
}

// ─── YouTube URL Validation ─────────────────────────────────────────────────

/**
 * Returns true if the URL belongs to a known YouTube hostname.
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return YOUTUBE_HOSTNAMES.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// ─── Link Type Classification ───────────────────────────────────────────────

/**
 * Classifies a YouTube URL into one of the 5 recognized link types.
 */
export function classifyYouTubeUrl(url: string): LinkType {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();

    if (pathname.includes("/shorts/")) {
      return "shorts";
    }

    if (pathname.includes("/channel/") || pathname.includes("/@")) {
      return "channel";
    }

    if (parsed.searchParams.has("list") && parsed.searchParams.has("v")) {
      return "playlist-video";
    }

    if (parsed.searchParams.has("list")) {
      return "playlist";
    }
  } catch {
    // fall through
  }

  return "video";
}

// ─── yt-dlp Execution ───────────────────────────────────────────────────────

interface YtdlpFormat {
  format_id?: string;
  ext?: string;
  height?: number | string;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  tbr?: number;
  abr?: number;
  filesize?: number;
  filesize_approx?: number;
  format_note?: string;
  resolution?: string;
}

interface YtdlpRawVideo {
  id?: string;
  url?: string;
  webpage_url?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  view_count?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string }>;
  formats?: YtdlpFormat[];
  upload_date?: string;
  extractor?: string;
}

interface YtdlpRawPlaylist {
  id?: string;
  webpage_url?: string;
  title?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string }>;
  entries?: YtdlpRawVideo[];
  extractor?: string;
}

function getFormatHeight(format: YtdlpFormat): number | undefined {
  if (typeof format.height === "number" && format.height > 0) {
    return format.height;
  }

  if (typeof format.height === "string" && Number(format.height) > 0) {
    return Number(format.height);
  }

  const candidates = [format.format_note, format.resolution];

  for (const value of candidates) {
    const match = String(value ?? "").match(/(?:x|\b)(\d{3,4})p?\b/i);
    if (match) {
      return Number(match[1]);
    }
  }

  const formatIdMatch = String(format.format_id ?? "").match(/(?:x|\b)(\d{3,4})p\b/i);
  if (formatIdMatch) {
    return Number(formatIdMatch[1]);
  }

  return undefined;
}

type YtdlpRawOutput = YtdlpRawVideo | YtdlpRawPlaylist;

let electronApp: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  electronApp = require("electron").app;
} catch {
  // Test environment without electron
}

function bundledYtdlpCandidates(): string[] {
  const candidates: string[] = [];

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "runtime", "yt-dlp.exe"));
  }

  if (process.defaultApp === true || (electronApp && electronApp.isPackaged === false)) {
    candidates.push(path.resolve(__dirname, "../../runtime/yt-dlp.exe"));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

// ─── Metadata Parsers ───────────────────────────────────────────────────────

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSize(size?: number): number {
  return size && size > 0 ? size : 0;
}

function extractThumbnail(
  raw: YtdlpRawVideo | YtdlpRawPlaylist
): string {
  if (raw.thumbnail) return raw.thumbnail;

  if (raw.thumbnails && raw.thumbnails.length > 0) {
    return raw.thumbnails[0]?.url ?? "";
  }

  return "";
}

function parseVideoMetadata(
  raw: YtdlpRawVideo,
  linkType: VideoLinkType,
  index = 1,
  sourceUrl?: string
): VideoMetadata {
  const videoId = raw.id ?? `unknown-${index}`;
  const formats = raw.formats ?? [];
  const thumbnail = extractThumbnail(raw) || (videoId !== `unknown-${index}`
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : "");

  // Extract available quality options
  const heights = new Set<number>();

  formats.forEach((f) => {
    const height = getFormatHeight(f);
    if (height && height > 0) {
      heights.add(height);
    }
  });

  const sortedHeights = Array.from(heights).sort((a, b) => b - a);
  const qualityOptions = sortedHeights.length > 0
    ? sortedHeights.map((h) => `${h}p`)
    : ["1080p", "720p", "480p", "360p", "240p", "144p"];

  const videoFormats = new Set(
    formats
      .map((f) => f.ext)
      .filter((ext): ext is string => !!ext)
      .filter((ext) => ["mp4", "webm", "mkv"].includes(ext))
  );

  const audioFormats = new Set<string>(["mp3", "opus"]);

  // Best format info (select format with highest resolution)
  const maxHeight = sortedHeights[0];
  const bestFormat = (maxHeight ? formats.find((f) => getFormatHeight(f) === maxHeight) : undefined)
    ?? formats.find((f) => getFormatHeight(f))
    ?? formats[0];
  const bestFormatHeight = bestFormat ? getFormatHeight(bestFormat) : undefined;

  const resolution = bestFormatHeight
    ? `${bestFormatHeight}p`
    : "1080p";

  const fps = bestFormat?.fps ?? 30;
  const videoCodec = bestFormat?.vcodec ?? "H.264";
  const audioCodec = bestFormat?.acodec ?? "AAC";

  const videoBitrate = bestFormat?.tbr
    ? `${(bestFormat.tbr / 1000).toFixed(1)} Mbps`
    : "0 Mbps";

  const audioBitrate = bestFormat?.abr
    ? `${Math.round(bestFormat.abr)} Kbps`
    : "0 Kbps";

  const fileSize = formatFileSize(
    bestFormat?.filesize ?? bestFormat?.filesize_approx
  );

  return {
    id: `yt-${linkType}-${videoId}`,
    sourceUrl: raw.webpage_url ?? sourceUrl ?? (videoId !== `unknown-${index}`
      ? `https://www.youtube.com/watch?v=${videoId}`
      : ""),
    linkType,
    thumbnail,
    title: raw.title ?? "Unknown Title",
    channelName: raw.uploader ?? raw.channel ?? "Unknown Channel",
    duration: formatDuration(raw.duration),
    views: raw.view_count ?? 0,
    qualityOptions:
      qualityOptions.length > 0
        ? qualityOptions
        : ["1080p", "720p", "480p"],
    videoFormats: Array.from(videoFormats).slice(0, 3), // Limit to 3
    audioFormats: Array.from(audioFormats),
    resolution,
    fps,
    videoCodec,
    audioCodec,
    videoBitrate,
    audioBitrate,
    container: bestFormat?.ext ?? "mp4",
    fileSize,
    uploadDate:
      raw.upload_date ??
      new Date().toISOString().split("T")[0] ??
      ""
  };
}

function parsePlaylistMetadata(
  raw: YtdlpRawPlaylist,
  url: string
): PlaylistMetadata {
  const playlistId = raw.id ?? "unknown-playlist";
  const entries = raw.entries ?? [];
  const playlistThumbnail = extractThumbnail(raw);

  const videos = entries
    .map((entry, index) => {
      const entryUrl = entry.url?.startsWith("http")
        ? entry.url
        : entry.id
          ? `https://www.youtube.com/watch?v=${entry.id}`
          : undefined;
      const video = parseVideoMetadata(entry, "playlist-video", index + 1, entryUrl);
      return video.thumbnail ? video : { ...video, thumbnail: playlistThumbnail };
    });

  return {
    id: `yt-playlist-${playlistId}`,
    sourceUrl: url,
    linkType: "playlist",
    title: raw.title ?? "Unknown Playlist",
    thumbnail: extractThumbnail(raw),
    videos
  };
}

function parseChannelMetadata(
  raw: YtdlpRawPlaylist,
  url: string
): ChannelMetadata {
  const channelId = raw.id ?? "unknown-channel";
  const entries = raw.entries ?? [];

  // Parse first 4 videos as latest videos preview
  const latestVideos = entries
    .slice(0, 4)
    .map((entry, index) =>
      parseVideoMetadata(entry, "video", index + 1)
    );

  return {
    id: `yt-channel-${channelId}`,
    sourceUrl: url,
    linkType: "channel",
    name: raw.title ?? "Unknown Channel",
    thumbnail: extractThumbnail(raw),
    mockVideoCount: entries.length,
    latestVideos
  };
}

// ─── NativeMetadataService ──────────────────────────────────────────────────

export class NativeMetadataService {
  private ytdlpPath: string | null = null;
  private inFlightAnalyses = new Map<string, Promise<AnalysisResult>>();
  private metadataCache = new MetadataCache<AnalysisResult>(
    50,
    1000 * 60 * 30 // 30 minutes TTL
  );
  private executor: ProcessExecutor;

  constructor(
    private settingsYtdlpPath?: string,
    executor?: ProcessExecutor
  ) {
    this.executor = executor ?? new DefaultProcessExecutor();
  }

  /**
   * Updates settings yt-dlp path dynamically without recreating instance or dropping cache.
   */
  updateSettingsYtdlpPath(newPath?: string): void {
    const trimmed = newPath?.trim() || undefined;
    if (this.settingsYtdlpPath !== trimmed) {
      this.settingsYtdlpPath = trimmed;
      this.ytdlpPath = null; // Re-resolve on next run
    }
  }

  /**
   * Resolves yt-dlp executable path.
   * Priority: settingsPath → bundled candidates → system PATH.
   *
   * Phase 14.1: System PATH fallback no longer spawns `--version`.
   * It only checks file accessibility (fs.access F_OK) which is O(1) and
   * avoids an extra Python/yt-dlp cold-start penalty on first analysis.
   */
  private async resolveYtdlpPath(): Promise<string> {
    const t0 = Date.now();

    // Priority 1: Settings-provided path
    if (this.settingsYtdlpPath && this.settingsYtdlpPath.trim()) {
      try {
        await this.executor.checkAccess(
          this.settingsYtdlpPath,
          fsConstants.F_OK
        );

        console.log(`[MetadataService] Resolved yt-dlp from settings (+${Date.now() - t0}ms): ${this.settingsYtdlpPath}`);
        return this.settingsYtdlpPath;
      } catch {
        // Invalid settings path - fall through to bundled candidates
      }
    }

    // Priority 2: Bundled runtime (packaged app)
    for (const candidate of bundledYtdlpCandidates()) {
      try {
        await this.executor.checkAccess(candidate, fsConstants.F_OK);
        console.log(`[MetadataService] Resolved bundled yt-dlp (+${Date.now() - t0}ms): ${candidate}`);
        return candidate;
      } catch {
        // Try the next bundled candidate.
      }
    }

    // Priority 3: System PATH — file-existence check only (no --version spawn).
    // Searching PATH manually avoids a cold yt-dlp Python startup just for discovery.
    const pathDirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
    for (const candidate of SYSTEM_PATH_CANDIDATES) {
      // Check absolute path in each PATH dir
      for (const dir of pathDirs) {
        const full = path.join(dir, candidate);
        try {
          await this.executor.checkAccess(full, fsConstants.F_OK);
          console.log(`[MetadataService] Resolved yt-dlp from PATH (+${Date.now() - t0}ms): ${full}`);
          return full;
        } catch {
          // Not in this dir, continue
        }
      }

      // Also try bare name (let OS resolve it at spawn time)
      // This is the last resort - we just trust the OS spawn to find it
    }

    // Last resort: try bare executable name and let OS resolve at spawn time
    console.warn(`[MetadataService] yt-dlp not found in PATH dirs, trying bare name as last resort (+${Date.now() - t0}ms)`);
    // Return the bare name and let the spawn fail at actual execution if not found
    // This avoids an extra --version process start
    for (const candidate of SYSTEM_PATH_CANDIDATES) {
      try {
        // Quick spawn test with immediate kill to detect ENOENT vs other errors
        await new Promise<void>((resolve, reject) => {
          const proc = this.executor.spawn(candidate, ["--version"], { timeout: 5000, windowsHide: true });
          proc.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "ENOENT") reject(new Error("not_found"));
            else resolve(); // exists but errored — still usable
          });
          proc.on("exit", () => resolve());
        });
        console.log(`[MetadataService] Resolved yt-dlp via bare name (+${Date.now() - t0}ms): ${candidate}`);
        return candidate;
      } catch {
        // Not found
      }
    }

    console.error(`[MetadataService] Could not resolve yt-dlp from any source (+${Date.now() - t0}ms)`);
    throw new Error("ytdlp_not_found");
  }

  /**
   * Phase 14.1 — Warm-up: eagerly resolve yt-dlp path and prime the singleton cache.
   * Call this on app startup (after app.whenReady) so the first user analysis
   * does NOT pay the path-resolution overhead.
   *
   * Fire-and-forget: errors are logged but never surfaced to the caller.
   */
  async warmUp(settingsYtdlpPath?: string): Promise<void> {
    if (settingsYtdlpPath !== undefined) {
      this.updateSettingsYtdlpPath(settingsYtdlpPath);
    }

    if (this.ytdlpPath) {
      console.log(`[MetadataService] warmUp: yt-dlp path already resolved: ${this.ytdlpPath}`);
      return;
    }

    try {
      const t0 = Date.now();
      this.ytdlpPath = await this.resolveYtdlpPath();
      console.log(`[MetadataService] warmUp complete in ${Date.now() - t0}ms → ${this.ytdlpPath}`);
    } catch (err) {
      // Log but don't throw — warmUp is best-effort
      console.warn("[MetadataService] warmUp failed (will retry on first analyze call):", err);
      this.ytdlpPath = null;
    }
  }

  /**
   * Spawns yt-dlp process and returns parsed JSON output.
   * Optimized with Buffer chunks to minimize memory allocations and GC thrashing.
   */
  private async executeYtdlp(
    ytdlpPath: string,
    url: string,
    isPlaylist = false,
    extractorArg?: string
  ): Promise<YtdlpRawOutput> {
    return new Promise((resolve, reject) => {
      const args = [
        "--dump-single-json",
        isPlaylist ? "--yes-playlist" : "--no-playlist",
        ...(isPlaylist ? ["--flat-playlist"] : []),
        ...(extractorArg ? ["--extractor-args", extractorArg] : []),
        "--skip-download",
        "--no-warnings",
        url
      ];

      const timeout = isPlaylist
        ? PLAYLIST_TIMEOUT_MS
        : YTDLP_TIMEOUT_MS;

      console.log(`[MetadataService] yt-dlp start type=${isPlaylist ? "playlist" : "video"} path=${ytdlpPath} timeoutMs=${timeout} args=${JSON.stringify(args.map((arg) => arg === url ? "<url>" : arg))}`);

      const proc = this.executor.spawn(
        ytdlpPath,
        args,
        {
          timeout,
          windowsHide: true
        }
      );

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const cleanupProcess = () => {
        try {
          proc.stdout?.removeAllListeners();
          proc.stderr?.removeAllListeners();
          proc.removeAllListeners();
        } catch {
          // ignore cleanup errors
        }
      };

      proc.stdout?.on("data", (data) => {
        stdoutChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      });

      proc.stderr?.on("data", (data) => {
        stderrChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      });

      proc.on("error", (err: any) => {
        cleanupProcess();
        try {
          if (!proc.killed) proc.kill();
        } catch {
          // ignore kill errors
        }

        const stderr = Buffer.concat(stderrChunks).toString("utf-8");
        stdoutChunks.length = 0;
        stderrChunks.length = 0;

        console.error(`[MetadataService] yt-dlp process error path=${ytdlpPath} code=${err.code ?? "unknown"} stderr=${stderr.slice(0, 4000)}`, err);
        if (err.code === "ETIMEDOUT") {
          reject(new Error("ytdlp_timeout"));
        } else if (err.code === "ENOENT") {
          reject(new Error("ytdlp_not_found"));
        } else {
          reject(new Error("ytdlp_spawn_failed"));
        }
      });

      proc.on("exit", (code) => {
        cleanupProcess();
        const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
        const stderr = Buffer.concat(stderrChunks).toString("utf-8");
        stdoutChunks.length = 0;
        stderrChunks.length = 0;

        console.log(`[MetadataService] yt-dlp exit code=${code} path=${ytdlpPath} stderr=${stderr.slice(0, 4000)}`);
        if (code === 0) {
          try {
            const parsed = JSON.parse(
              stdout
            ) as YtdlpRawOutput;

            resolve(parsed);
          } catch (jsonErr) {
            console.error(`[MetadataService] Failed to parse yt-dlp JSON path=${ytdlpPath} stdout=${stdout.slice(0, 1000)}`, jsonErr);
            reject(new Error("ytdlp_invalid_json"));
          }
        } else {
          console.error(`[MetadataService] yt-dlp failed code=${code} path=${ytdlpPath} stderr=${stderr.slice(0, 4000)}`);
          // Map common yt-dlp error messages
          const stderrLower = stderr.toLowerCase();

          if (
            stderrLower.includes("private video") ||
            stderrLower.includes("members-only")
          ) {
            reject(new Error("video_private"));
          } else if (
            stderrLower.includes("video unavailable") ||
            stderrLower.includes("not available")
          ) {
            reject(new Error("video_unavailable"));
          } else if (
            stderrLower.includes("unsupported url")
          ) {
            reject(new Error("unsupported_url"));
          } else if (
            stderrLower.includes("network") ||
            stderrLower.includes("connection")
          ) {
            reject(new Error("network_error"));
          } else {
            reject(new Error("ytdlp_failed"));
          }
        }
      });
    });
  }

  private isRetryableYtdlpFailure(error: unknown): boolean {
    const message = String(error).toLowerCase();
    // NEVER retry non-retryable conditions: timeouts, private/unavailable videos, unsupported URLs.
    // Retrying on timeout multiplies delays by 6 and exhausts RAM/CPU.
    if (
      message.includes("private") ||
      message.includes("unavailable") ||
      message.includes("not available") ||
      message.includes("unsupported") ||
      message.includes("timeout") ||
      message.includes("ytdlp_timeout") ||
      message.includes("network")
    ) {
      return false;
    }

    // Only retry client restriction / bot detection failures
    return [
      "sign in to confirm",
      "bot",
      "player_client",
      "429"
    ].some((token) => message.includes(token));
  }

  private async executeYtdlpWithFallback(
    ytdlpPath: string,
    url: string,
    isPlaylist = false
  ): Promise<YtdlpRawOutput> {
    // Only attempt default first, then at most one viable player client fallback (android) if blocked by bot check
    const extractorArgCandidates: Array<string | undefined> = [
      undefined,
      "youtube:player_client=android",
    ];

    let lastError: unknown = null;

    for (const extractorArg of extractorArgCandidates) {
      try {
        return await this.executeYtdlp(ytdlpPath, url, isPlaylist, extractorArg);
      } catch (error) {
        lastError = error;
        if (!this.isRetryableYtdlpFailure(error)) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error("ytdlp_failed");
  }

  /**
   * Analyzes a YouTube URL using yt-dlp and returns typed AnalysisResult.
   */
  async analyze(url: string): Promise<AnalysisResult> {
    // Validate input
    if (!url || typeof url !== "string") {
      throw new Error("invalid_url");
    }

    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      throw new Error("invalid_url");
    }

    // Validate parseable URL
    try {
      new URL(trimmedUrl);
    } catch {
      throw new Error("invalid_url");
    }

    // Validate YouTube URL
    if (!isYouTubeUrl(trimmedUrl)) {
      throw new Error("unsupported_url");
    }

    // 🚀 Check cache first for instant results
    const cachedResult = this.metadataCache.get(trimmedUrl);

    if (cachedResult) {
      console.log(
        `[MetadataService] Cache hit for ${trimmedUrl}`
      );

      return cachedResult;
    }

    const inFlight = this.inFlightAnalyses.get(trimmedUrl);
    if (inFlight) {
      console.log(`[MetadataService] Reusing in-flight analysis for ${trimmedUrl}`);
      return inFlight;
    }

    const analysis = this.analyzeUncached(trimmedUrl);
    this.inFlightAnalyses.set(trimmedUrl, analysis);
    try {
      return await analysis;
    } finally {
      if (this.inFlightAnalyses.get(trimmedUrl) === analysis) {
        this.inFlightAnalyses.delete(trimmedUrl);
      }
    }
  }

  private async analyzeUncached(trimmedUrl: string): Promise<AnalysisResult> {
    const t0 = Date.now();

    // Phase 14.1: Resolve yt-dlp path (cached after first successful resolution).
    // warmUp() should have pre-populated this.ytdlpPath on startup; this is the fallback.
    if (!this.ytdlpPath) {
      console.warn(`[MetadataService] yt-dlp path not pre-resolved — resolving now (this adds latency to first analysis)`);
      const tResolve = Date.now();
      this.ytdlpPath = await this.resolveYtdlpPath();
      console.log(`[MetadataService] yt-dlp path resolved in ${Date.now() - tResolve}ms → ${this.ytdlpPath}`);
    } else {
      console.log(`[MetadataService] yt-dlp path already resolved (warmUp succeeded): ${this.ytdlpPath}`);
    }

    const tAfterResolve = Date.now();
    const linkType = classifyYouTubeUrl(trimmedUrl);
    console.log(`[MetadataService] Phase timing — pathResolve: ${tAfterResolve - t0}ms | type: ${linkType} | url: ${trimmedUrl}`);

    let result: AnalysisResult;

    // Handle different link types
    if (linkType === "playlist" || linkType === "channel") {
      const tYtdlp = Date.now();
      const raw = await this.executeYtdlpWithFallback(
        this.ytdlpPath,
        trimmedUrl,
        true
      );
      console.log(`[MetadataService] Phase timing — ytdlp (${linkType}): ${Date.now() - tYtdlp}ms`);

      const tParse = Date.now();
      if (linkType === "playlist") {
        result = parsePlaylistMetadata(
          raw as YtdlpRawPlaylist,
          trimmedUrl
        );
      } else {
        result = parseChannelMetadata(
          raw as YtdlpRawPlaylist,
          trimmedUrl
        );
      }
      console.log(`[MetadataService] Phase timing — parse (${linkType}): ${Date.now() - tParse}ms`);
    } else {
      // video | shorts | playlist-video
      const tYtdlp = Date.now();
      const raw = await this.executeYtdlpWithFallback(
        this.ytdlpPath,
        trimmedUrl,
        false
      );
      console.log(`[MetadataService] Phase timing — ytdlp (video): ${Date.now() - tYtdlp}ms`);

      const tParse = Date.now();
      result = parseVideoMetadata(
        raw as YtdlpRawVideo,
        linkType,
        1
      );
      console.log(`[MetadataService] Phase timing — parse (video): ${Date.now() - tParse}ms`);
    }

    // 💾 Cache the result for future requests (shared cache)
    this.metadataCache.set(trimmedUrl, result);

    console.log(
      `[MetadataService] Analysis complete — total: ${Date.now() - t0}ms | url: ${trimmedUrl}`
    );

    return result;
  }

  /**
   * Clears in-memory metadata cache.
   */
  clearCache(): void {
    this.metadataCache.clear();
  }
}

// ─── Shared Instance Provider ───────────────────────────────────────────────

let sharedMetadataServiceInstance: NativeMetadataService | null = null;

export function getSharedMetadataService(
  settingsYtdlpPath?: string,
  executor?: ProcessExecutor
): NativeMetadataService {
  if (!sharedMetadataServiceInstance) {
    sharedMetadataServiceInstance = new NativeMetadataService(settingsYtdlpPath, executor);
  } else {
    if (settingsYtdlpPath !== undefined) {
      sharedMetadataServiceInstance.updateSettingsYtdlpPath(settingsYtdlpPath);
    }
  }
  return sharedMetadataServiceInstance;
}

export function resetSharedMetadataService(): void {
  sharedMetadataServiceInstance = null;
}