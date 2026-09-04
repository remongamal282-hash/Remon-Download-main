/**
 * NativeDownloadService — Real yt-dlp download engine for Electron Main Process.
 *
 * Architecture:
 * - Uses yt-dlp child_process for actual downloads
 * - Manages active download processes with Map<id, ActiveDownload>
 * - Emits progress events via EventEmitter
 * - Supports pause (kill process + keep .part), resume (restart with --continue)
 * - Respects concurrent download slots from settings
 * - Uses ProcessExecutor abstraction for testability (same pattern as NativeMetadataService)
 *
 * Pause/Resume Strategy (Architectural Decision):
 * - Pause = terminate yt-dlp process cleanly, preserve partial .part file
 * - Resume = restart yt-dlp with --continue flag to resume from .part file
 * - This approach works on Windows (no SIGSTOP/SIGCONT needed)
 * - Resume may fail if source doesn't support range requests (handled as error)
 *
 * Security:
 * - shell: false always
 * - URL passed as separate argument (no command injection)
 * - No secrets in logs
 */

import { EventEmitter } from "events";
import { ChildProcess, spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import { constants as fsConstants } from "fs";
import type { DownloadItem, DownloadStatus } from "../../src/types/download";
import type { AppSettings } from "../../src/types/settings";

/**
 * ProcessExecutor interface for dependency injection
 * (same pattern as NativeMetadataService)
 */
export interface ProcessExecutor {
  spawn(
    command: string,
    args: string[],
    options?: any
  ): ChildProcess;

  checkAccess(
    path: string,
    mode?: number
  ): Promise<void>;
}

let electronApp: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  electronApp = require("electron").app;
} catch {
  // Test environment without electron
}

function bundledRuntimeCandidates(fileName: string): string[] {
  const candidates: string[] = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "runtime", fileName));
  }
  if (process.defaultApp === true || (electronApp && electronApp.isPackaged === false)) {
    candidates.push(path.resolve(__dirname, "../../runtime", fileName));
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

/**
 * Default ProcessExecutor using Node.js built-ins
 */
export class DefaultProcessExecutor implements ProcessExecutor {
  spawn(
    command: string,
    args: string[],
    options?: any
  ): ChildProcess {
    const { spawn } = require("child_process");
    return spawn(command, args, options);
  }

  checkAccess(
    path: string,
    mode?: number
  ): Promise<void> {
    return fs.access(path, mode);
  }
}

/**
 * Active download process state
 */
interface ActiveDownload {
  item: DownloadItem;
  process: ChildProcess | null;
  outputPath: string;
  startTime: number;
  lastProgressTime: number;
  isStopped?: boolean;
}

/**
 * Progress data parsed from yt-dlp output
 */
interface YtdlpProgress {
  progress: number;
  downloadedSize: number;
  totalSize: number;
  speed: number;
  eta: string;
}

/**
 * Native Download Service for Electron Main Process
 */
export class NativeDownloadService extends EventEmitter {
  private activeDownloads: Map<string, ActiveDownload> = new Map();
  private processGenerations: Map<string, number> = new Map();
  private items: Map<string, DownloadItem> = new Map();
  private executor: ProcessExecutor;
  private ytdlpPath: string | null = null;
  private settings: AppSettings;

  constructor(
    settings: AppSettings,
    executor?: ProcessExecutor
  ) {
    super();

    this.settings = settings;
    this.executor = executor ?? new DefaultProcessExecutor();
  }

  /**
   * Update settings
   */
  updateSettings(settings: AppSettings): void {
    // Keep the previous path before replacing settings.
    const previousYtdlpPath = this.settings.ytdlpPath;

    this.settings = settings;

    // Invalidate cached yt-dlp path only if the configured path changed.
    if (settings.ytdlpPath !== previousYtdlpPath) {
      this.ytdlpPath = null;
    }
  }

  /**
   * Resolves yt-dlp executable path
   *
   * Priority:
   * 1. Settings ytdlpPath
   * 2. System PATH candidates
   */
  private async resolveYtdlpPath(): Promise<string> {
    // Priority 1: Settings-provided path
    if (
      this.settings.ytdlpPath &&
      this.settings.ytdlpPath.trim()
    ) {
      try {
        await this.executor.checkAccess(
          this.settings.ytdlpPath,
          fsConstants.F_OK
        );

        return this.settings.ytdlpPath;
      } catch {
        // Invalid settings path - fall through to PATH.
      }
    }

    for (const candidate of bundledRuntimeCandidates("yt-dlp.exe")) {
      try {
        await this.executor.checkAccess(candidate, fsConstants.F_OK);
        return candidate;
      } catch {
        // Try the next bundled or PATH candidate.
      }
    }

    // Priority 2: System PATH
    const candidates = [
      "yt-dlp",
      "yt-dlp.exe",
      "youtube-dl",
      "youtube-dl.exe"
    ];

    for (const candidate of candidates) {
      try {
        await new Promise<void>((resolve, reject) => {
          const proc = this.executor.spawn(
            candidate,
            ["--version"],
            {
              timeout: 5000
            }
          );

          proc.on("error", reject);

          proc.on("exit", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(
                new Error(`Exit code ${code}`)
              );
            }
          });
        });

        return candidate;
      } catch {
        // Try next candidate.
      }
    }

    throw new Error("ytdlp_not_found");
  }

  private async resolveBundledFfmpegDirectory(): Promise<string | null> {
    const ffmpegPaths = bundledRuntimeCandidates("ffmpeg.exe");
    const ffprobePaths = bundledRuntimeCandidates("ffprobe.exe");

    for (let index = 0; index < ffmpegPaths.length; index += 1) {
      try {
        await this.executor.checkAccess(ffmpegPaths[index], fsConstants.F_OK);
        await this.executor.checkAccess(ffprobePaths[index], fsConstants.F_OK);
        return path.dirname(ffmpegPaths[index]);
      } catch {
        // Try the next bundled location.
      }
    }

    return null;
  }

  /**
   * Builds yt-dlp arguments array for download
   */
  private buildYtdlpArgs(
    item: DownloadItem,
    outputPath: string,
    isResume: boolean,
    ffmpegDirectory: string | null
  ): string[] {
    const args: string[] = [];

    const isAudioFormat = [
      "mp3",
      "opus"
    ].includes(item.format ?? "");

    // Continue from partial download if resume.
    if (isResume) {
      args.push("--continue");
    } else {
      args.push("--no-continue");
      args.push("--force-overwrites");
    }

    // Output path
    args.push("-o", outputPath);

    // Quality / format selection
    if (isAudioFormat) {
      args.push("-f", "bestaudio/best");
      args.push("--extract-audio");
      args.push("--audio-format", item.format!);
      args.push("--audio-quality", "0");
    } else if (
      item.quality &&
      item.quality !== "auto"
    ) {
      const height = item.quality.replace("p", "");

      args.push(
        "-f",
        `bestvideo[height<=${height}]+bestaudio/best`
      );
    } else {
      args.push("-f", "best");
    }

    // Merge output format
    if (
      item.format &&
      item.format !== "auto" &&
      !isAudioFormat
    ) {
      args.push(
        "--merge-output-format",
        item.format
      );

      args.push(
        "--remux-video",
        item.format
      );
    }

    // Speed limit
    if (
      this.settings.speedLimit !== "unlimited"
    ) {
      const limitKB = Math.floor(
        this.settings.speedLimit / 1024
      );

      args.push("-r", `${limitKB}K`);
    }

    // FFmpeg location
    const ffmpegLocation = this.settings.ffmpegPath.trim() || ffmpegDirectory;
    if (ffmpegLocation) {
      args.push(
        "--ffmpeg-location",
        ffmpegLocation
      );
    }

    // Fragment retries
    args.push(
      "--fragment-retries",
      "10"
    );

    // Retry on network errors
    args.push(
      "--retries",
      "10"
    );

    args.push(
      "--retry-sleep",
      "5"
    );

    // Geo bypass
    args.push("--geo-bypass");

    // Wait for availability
    args.push("-w");

    // Progress output
    args.push("--newline");

    args.push(
      "--progress-template",
      "download:%(progress._percent_str)s|%(progress._downloaded_bytes_str)s|%(progress._total_bytes_str)s|%(progress._speed_str)s|%(progress._eta_str)s"
    );

    // No warnings
    args.push("--no-warnings");

    // URL - always last and passed as separate argument.
    // Playlist entries must be downloaded individually; never expand a playlist here.
    args.push("--no-playlist");
    args.push(item.sourceUrl);

    return args;
  }

  /**
   * Parse yt-dlp progress line.
   *
   * Supports:
   *
   * download:15.2%|1.5MiB|10MiB|500KiB/s|00:15
   *
   * and:
   *
   * [download] 15.3% of 10.0MiB at 1.0MiB/s ETA 00:05
   */
  private parseProgressLine(
    line: string
  ): YtdlpProgress | null {
    const normalized = line.trim();

    if (!normalized) {
      return null;
    }

    const data = normalized.startsWith("download:")
      ? normalized.substring("download:".length)
      : normalized.replace(
        /^\[download\]\s*/i,
        ""
      );

    if (!data) {
      return null;
    }

    const pipeParts = data.split("|");

    if (pipeParts.length >= 5) {
      const [
        percentPart,
        downloadedPart,
        totalPart,
        speedPart,
        etaPart
      ] = pipeParts;

      const progress =
        parseFloat(
          percentPart.trim().replace("%", "")
        ) || 0;

      const totalSize =
        this.parseSize(totalPart.trim());

      let downloadedSize =
        this.parseSize(
          downloadedPart.trim()
        );

      if (
        downloadedSize === 0 &&
        totalSize > 0 &&
        progress > 0
      ) {
        downloadedSize = Math.min(
          totalSize,
          Math.round(
            (progress / 100) * totalSize
          )
        );
      }

      const speed =
        this.parseSize(
          speedPart
            .trim()
            .replace(/\/s$/i, "")
        );

      const eta =
        etaPart.trim() === "Unknown ETA"
          ? "--"
          : etaPart.trim() || "--";

      return {
        progress: Math.min(
          100,
          progress
        ),
        downloadedSize,
        totalSize,
        speed,
        eta
      };
    }

    const percentMatch =
      data.match(
        /(\d+(?:\.\d+)?)%/i
      );

    if (!percentMatch) {
      return null;
    }

    const progress =
      parseFloat(percentMatch[1]) || 0;

    const totalMatch =
      data.match(
        /of\s+(\d+(?:\.\d+)?)\s*([KMGT]?i?B)/i
      );

    const totalSize =
      this.parseSize(
        totalMatch
          ? `${totalMatch[1]}${totalMatch[2]}`
          : "0B"
      );

    const speedMatch =
      data.match(
        /at\s+(\d+(?:\.\d+)?)\s*([KMGT]?i?B)\/s/i
      ) ||
      data.match(
        /(\d+(?:\.\d+)?)\s*([KMGT]?i?B)\/s/i
      );

    const speed =
      speedMatch
        ? this.parseSize(
          `${speedMatch[1]}${speedMatch[2]}`
        )
        : 0;

    const etaMatch =
      data.match(
        /ETA\s+([0-9:]+|N\/A|Unknown ETA|Unknown)/i
      );

    const eta =
      etaMatch &&
        etaMatch[1] &&
        etaMatch[1].toLowerCase() !== "unknown" &&
        etaMatch[1].toLowerCase() !== "n/a"
        ? etaMatch[1]
        : "--";

    const downloadedSize =
      totalSize > 0
        ? Math.min(
          totalSize,
          Math.round(
            (progress / 100) * totalSize
          )
        )
        : 0;

    return {
      progress: Math.min(
        100,
        progress
      ),
      downloadedSize,
      totalSize,
      speed,
      eta
    };
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(
    sizeStr: string
  ): number {
    if (
      !sizeStr ||
      sizeStr === "N/A" ||
      sizeStr === "Unknown"
    ) {
      return 0;
    }

    const normalized =
      sizeStr
        .trim()
        .replace(/\s*\/s$/i, "");

    const match =
      normalized.match(
        /^([\d.]+)\s*([KMGT]i?B)?$/i
      );

    if (!match) {
      return 0;
    }

    const value =
      parseFloat(match[1]);

    const unit =
      (match[2] || "B").toUpperCase();

    const multipliers: Record<
      string,
      number
    > = {
      B: 1,
      KB: 1000,
      KIB: 1024,
      MB: 1000 * 1000,
      MIB: 1024 * 1024,
      GB: 1000 * 1000 * 1000,
      GIB: 1024 * 1024 * 1024,
      TB: 1000 * 1000 * 1000 * 1000,
      TIB: 1024 * 1024 * 1024 * 1024
    };

    return Math.floor(
      value *
      (multipliers[unit] || 1)
    );
  }

  /**
   * Emits progress event to Main Process
   */
  private emitProgress(
    id: string,
    progress: YtdlpProgress
  ): void {
    this.emit(
      "download:progress",
      {
        id,
        progress: progress.progress,
        downloadedSize:
          progress.downloadedSize,
        totalSize:
          progress.totalSize,
        speed: progress.speed,
        eta: progress.eta
      }
    );
  }

  /**
   * Ingest yt-dlp stdout/stderr chunks
   * and emit progress updates.
   */
  private ingestProgressOutput(
    itemId: string,
    generation: number,
    activeDownload: ActiveDownload,
    chunk: string,
    lineBuffer: { value: string }
  ): void {
    if (activeDownload.isStopped) {
      return;
    }

    lineBuffer.value += chunk;

    const lines =
      lineBuffer.value.split("\n");

    lineBuffer.value =
      lines.pop() || "";

    for (const line of lines) {
      const progress =
        this.parseProgressLine(
          line.trim()
        );

      if (!progress) {
        continue;
      }

      if (
        !this.isCurrentProcess(
          itemId,
          generation
        )
      ) {
        continue;
      }

      activeDownload.lastProgressTime =
        Date.now();

      this.emitProgress(
        itemId,
        progress
      );

      const currentItem =
        this.items.get(itemId);

      if (currentItem) {
        this.items.set(
          itemId,
          {
            ...currentItem,
            progress:
              progress.progress,
            downloadedSize:
              progress.downloadedSize,
            fileSize:
              progress.totalSize ||
              currentItem.fileSize,
            speed:
              progress.speed,
            eta:
              progress.eta,
            lastUpdatedAt:
              Date.now()
          }
        );
      }
    }
  }

  private async isOutputFileComplete(
    outputPath: string,
    item: DownloadItem
  ): Promise<boolean> {
    try {
      const stat =
        await fs.stat(outputPath);

      if (stat.size <= 0) {
        return false;
      }

      const isNearComplete =
        stat.size >=
        item.fileSize * 0.9;

      const isEqual =
        stat.size >=
        item.fileSize * 0.99;

      return (
        item.progress >= 95 ||
        isNearComplete ||
        isEqual
      );
    } catch {
      return false;
    }
  }

  private async markDownloadCompleted(
    id: string,
    outputPath: string
  ): Promise<void> {
    const currentItem =
      this.items.get(id);

    if (!currentItem) {
      return;
    }

    this.updateItemStatus(
      id,
      "merging"
    );

    this.emitStateChange(
      id,
      "merging"
    );

    this.updateItemStatus(
      id,
      "converting"
    );

    this.emitStateChange(
      id,
      "converting"
    );

    const finalFileSize =
      await this.resolveCompletedFileSize(
        outputPath,
        currentItem.fileSize
      );

    this.updateItemStatus(
      id,
      "completed",
      {
        progress: 100,
        fileSize: finalFileSize,
        downloadedSize:
          finalFileSize,
        speed: 0,
        eta: "--"
      }
    );

    this.emitStateChange(
      id,
      "completed"
    );

    console.log(
      `[Download] ✓ Marked as completed: ${id} (actual size: ${finalFileSize} bytes)`
    );
  }

  /**
   * Emits state change event
   */
  private emitStateChange(
    id: string,
    status: DownloadStatus,
    errorCode?: string,
    errorMessage?: string
  ): void {
    const item =
      this.items.get(id);

    if (!item) {
      console.warn(
        `[Download] Cannot emit state change for unknown item: ${id}`
      );
      return;
    }

    console.log(
      `[Download] State change: ${id} → ${status} (progress: ${item.progress}%, downloaded: ${item.downloadedSize} bytes)`
    );

    this.emit(
      "download:state-change",
      {
        id,
        status,
        progress:
          item.progress,
        downloadedSize:
          item.downloadedSize,
        fileSize:
          item.fileSize,
        speed:
          item.speed,
        eta:
          item.eta,
        errorCode,
        errorMessage
      }
    );
  }

  private nextProcessGeneration(
    id: string
  ): number {
    const next =
      (this.processGenerations.get(id) ?? 0) +
      1;

    this.processGenerations.set(
      id,
      next
    );

    return next;
  }

  private isCurrentProcess(
    id: string,
    generation: number
  ): boolean {
    const activeGeneration =
      this.processGenerations.get(id) ?? 0;

    if (
      activeGeneration !== generation
    ) {
      return false;
    }

    const currentItem =
      this.items.get(id);

    if (!currentItem) {
      return false;
    }

    return [
      "downloading",
      "retrying"
    ].includes(
      currentItem.status
    );
  }

  /**
   * Resolve download folder
   */
  private resolveDownloadFolder(
    downloadFolder: string
  ): string {
    if (
      !downloadFolder ||
      downloadFolder.trim() === ""
    ) {
      return (
        process.env.HOME ||
        process.env.USERPROFILE ||
        process.cwd()
      );
    }

    if (downloadFolder === "~") {
      return (
        process.env.HOME ||
        process.env.USERPROFILE ||
        process.cwd()
      );
    }

    if (
      downloadFolder.startsWith("~/") ||
      downloadFolder.startsWith("~\\")
    ) {
      const homeDir =
        process.env.HOME ||
        process.env.USERPROFILE ||
        process.cwd();

      return path.join(
        homeDir,
        downloadFolder.slice(2)
      );
    }

    return downloadFolder;
  }

  private async resolveCompletedFileSize(
    outputPath: string,
    estimatedSize: number
  ): Promise<number> {
    try {
      const stat =
        await fs.stat(outputPath);

      if (stat.size > 0) {
        return stat.size;
      }
    } catch {
      // Ignore stat errors.
    }

    return Math.max(
      estimatedSize,
      0
    );
  }

  /**
   * Kill process tree
   */
  private killProcessTree(
    proc: ChildProcess | null
  ): void {
    if (
      !proc ||
      !proc.pid
    ) {
      console.warn(
        `[Download] killProcessTree called but process is null or has no PID`
      );

      return;
    }

    const pid = proc.pid;

    console.log(
      `[Download] Attempting to kill process tree for PID: ${pid}`
    );

    try {
      console.log(
        `[Download] Sending SIGKILL to PID ${pid}...`
      );

      proc.kill("SIGKILL");

      console.log(
        `[Download] ✓ Sent SIGKILL to PID ${pid}`
      );
    } catch (err) {
      console.warn(
        `[Download] SIGKILL failed for PID ${pid}:`,
        err
      );
    }

    const isWindows =
      process.platform === "win32";

    if (isWindows) {
      try {
        console.log(
          `[Download] Attempting taskkill for PID ${pid} (Windows) with /F /T flags`
        );

        const killer = spawn(
          "taskkill",
          [
            "/PID",
            String(pid),
            "/T",
            "/F"
          ],
          {
            stdio: "pipe",
            windowsHide: true
          }
        );

        let killOutput = "";
        let killError = "";

        killer.stdout?.on(
          "data",
          (data) => {
            killOutput +=
              data.toString();
          }
        );

        killer.stderr?.on(
          "data",
          (data) => {
            killError +=
              data.toString();
          }
        );

        killer.on(
          "exit",
          (code) => {
            if (code === 0) {
              console.log(
                `[Download] ✓ taskkill succeeded for PID ${pid}: ${killOutput.trim()}`
              );
            } else if (
              code === 128
            ) {
              console.log(
                `[Download] ✓ Process ${pid} not found (already dead), exit code 128`
              );
            } else {
              console.warn(
                `[Download] taskkill failed with code ${code} for PID ${pid}: ${killError.trim()}`
              );
            }
          }
        );

        killer.on(
          "error",
          (err) => {
            console.warn(
              `[Download] taskkill error for PID ${pid}:`,
              err
            );
          }
        );
      } catch (err) {
        console.warn(
          `[Download] Failed to spawn taskkill for PID ${pid}:`,
          err
        );
      }
    }
  }

  private async cleanupStaleDownloadArtifacts(
    outputPath: string
  ): Promise<void> {
    const candidates = [
      outputPath,
      `${outputPath}.part`
    ];

    for (
      const candidate of candidates
    ) {
      try {
        await fs.rm(
          candidate,
          {
            force: true
          }
        );
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  /**
   * Spawn yt-dlp process for download
   */
  private async spawnDownload(
    item: DownloadItem,
    isResume: boolean
  ): Promise<void> {
    // Resolve yt-dlp path.
    if (!this.ytdlpPath) {
      this.ytdlpPath =
        await this.resolveYtdlpPath();
    }

    const ffmpegDirectory = await this.resolveBundledFfmpegDirectory();

    // Build output path.
    const fileName =
      `${item.title.replace(
        /[<>:"/\\|?*]/g,
        "_"
      )}.${item.format}`;

    const outputDir =
      this.resolveDownloadFolder(
        this.settings.downloadFolder
      );

    const outputPath =
      path.join(
        outputDir,
        fileName
      );

    const partialPath =
      `${outputPath}.part`;

    console.log(
      `[Download] spawnDownload: ${item.id}`
    );

    console.log(
      `[Download]   Output: ${outputPath}`
    );

    console.log(
      `[Download]   Partial: ${partialPath}`
    );

    console.log(
      `[Download]   isResume: ${isResume}`
    );

    if (isResume) {
      let partialFileFound = false;

      // Check direct .part file.
      try {
        const stat = await fs.stat(partialPath);
        partialFileFound = true;
        console.log(
          `[Download] ✓ Direct partial file found: ${partialPath} (${stat.size} bytes), resuming with --continue`
        );
      } catch {
        // Look for stream-specific part files (e.g. video.f137.mp4.part, video.webm.part, video.ytdl)
        try {
          const baseName = path.basename(outputPath, path.extname(outputPath));
          const files = await fs.readdir(outputDir);
          const matchingParts = files.filter(
            (f) =>
              f.startsWith(baseName) &&
              (f.endsWith(".part") || f.includes(".part") || f.endsWith(".ytdl") || f.includes(".temp"))
          );
          if (matchingParts.length > 0) {
            partialFileFound = true;
            console.log(
              `[Download] ✓ Stream partial files found in ${outputDir}: ${matchingParts.join(", ")}, resuming with --continue`
            );
          }
        } catch {
          // Directory read error or not existing
        }
      }

      if (!partialFileFound) {
        console.log(
          `[Download] ℹ Partial file not found prior to resume; yt-dlp will proceed with --continue`
        );
      }
    }

    // Cleanup stale artifacts only when starting fresh (never when resuming).
    if (!isResume) {
      console.log(
        `[Download] Cleaning up stale artifacts...`
      );

      await this.cleanupStaleDownloadArtifacts(
        outputPath
      );
    }

    const args =
      this.buildYtdlpArgs(
        item,
        outputPath,
        isResume,
        ffmpegDirectory
      );

    console.log(
      `[Download] Starting yt-dlp with ${isResume ? "RESUME" : "FRESH"} (${args.length} args)`
    );

    const proc =
      this.executor.spawn(
        this.ytdlpPath,
        args,
        {
          windowsHide: true,
          shell: false
        }
      );

    const generation =
      this.nextProcessGeneration(
        item.id
      );

    const activeDownload:
      ActiveDownload = {
      item,
      process: proc,
      outputPath,
      startTime:
        Date.now(),
      lastProgressTime:
        Date.now()
    };

    this.activeDownloads.set(
      item.id,
      activeDownload
    );

    console.log(
      `[Download] ✓ Added to activeDownloads: ${item.id} (generation: ${generation}, PID: ${proc.pid})`
    );

    this.updateItemStatus(
      item.id,
      "downloading"
    );

    this.emitStateChange(
      item.id,
      "downloading"
    );

    let stdoutBuffer = {
      value: ""
    };

    let stderrProgressBuffer = {
      value: ""
    };

    let stderrBuffer = "";

    proc.stdout?.on(
      "data",
      (data) => {
        this.ingestProgressOutput(
          item.id,
          generation,
          activeDownload,
          data.toString(),
          stdoutBuffer
        );
      }
    );

    proc.stderr?.on(
      "data",
      (data) => {
        const chunk =
          data.toString();

        stderrBuffer +=
          chunk;

        this.ingestProgressOutput(
          item.id,
          generation,
          activeDownload,
          chunk,
          stderrProgressBuffer
        );
      }
    );

    /**
     * Handle process exit
     */
    proc.on(
      "exit",
      async (code) => {
        if (
          activeDownload.isStopped
        ) {
          this.activeDownloads.delete(
            item.id
          );

          return;
        }

        if (
          !this.isCurrentProcess(
            item.id,
            generation
          )
        ) {
          console.log(
            `[Download] Exit ignored: ${item.id} (stale generation)`
          );

          return;
        }

        this.activeDownloads.delete(
          item.id
        );

        console.log(
          `[Download] yt-dlp exited with code: ${code} for ${item.id}`
        );

        const currentItem =
          this.items.get(
            item.id
          );

        if (!currentItem) {
          return;
        }

        const fileComplete =
          await this.isOutputFileComplete(
            outputPath,
            currentItem
          );

        if (
          code === 0 ||
          fileComplete
        ) {
          console.log(
            `[Download] ✓ Download completed successfully: ${item.id}`
          );

          await this.markDownloadCompleted(
            item.id,
            outputPath
          );

          return;
        }

        if (
          code === 8 ||
          stderrBuffer
            .toLowerCase()
            .includes("error") === false
        ) {
          console.log(
            `[Download] Exit code ${code} - checking if file exists...`
          );

          if (fileComplete) {
            console.log(
              `[Download] ✓ Output file complete despite exit code ${code}, marking as completed`
            );

            await this.markDownloadCompleted(
              item.id,
              outputPath
            );

            return;
          }

          console.warn(
            `[Download] ✗ Download failed with exit code ${code}`
          );

          const errorMessage =
            this.mapYtdlpError(
              stderrBuffer,
              code
            );

          this.updateItemStatus(
            item.id,
            "failed",
            {
              errorCode:
                errorMessage.code,
              errorMessage:
                errorMessage.message,
              speed: 0,
              eta: "--"
            }
          );

          this.emitStateChange(
            item.id,
            "failed",
            errorMessage.code,
            errorMessage.message
          );

          return;
        }

        console.warn(
          `[Download] ✗ Download failed with exit code ${code}`
        );

        if (
          currentItem.status !==
          "paused" &&
          currentItem.status !==
          "canceled"
        ) {
          const errorMessage =
            this.mapYtdlpError(
              stderrBuffer,
              code
            );

          this.updateItemStatus(
            item.id,
            "failed",
            {
              errorCode:
                errorMessage.code,
              errorMessage:
                errorMessage.message,
              speed: 0,
              eta: "--"
            }
          );

          this.emitStateChange(
            item.id,
            "failed",
            errorMessage.code,
            errorMessage.message
          );
        }
      }
    );

    /**
     * Handle spawn errors
     */
    proc.on(
      "error",
      (err: any) => {
        if (
          !this.isCurrentProcess(
            item.id,
            generation
          )
        ) {
          return;
        }

        this.activeDownloads.delete(
          item.id
        );

        let errorCode:
          import(
          "../../src/types/errors"
          ).AppErrorCode =
          "ytdlp_error";

        let errorMessage =
          "Failed to spawn yt-dlp process";

        if (
          err.code === "ENOENT"
        ) {
          errorCode =
            "ytdlp_not_found";

          errorMessage =
            "yt-dlp executable not found";
        }

        this.updateItemStatus(
          item.id,
          "failed",
          {
            errorCode,
            errorMessage,
            speed: 0,
            eta: "--"
          }
        );

        this.emitStateChange(
          item.id,
          "failed",
          errorCode,
          errorMessage
        );
      }
    );
  }

  /**
   * Maps yt-dlp stderr output to error codes
   */
  private mapYtdlpError(
    stderr: string,
    exitCode: number | null
  ): {
    code: import(
    "../../src/types/errors"
    ).AppErrorCode;

    message: string;
  } {
    if (
      !stderr ||
      stderr.trim().length === 0
    ) {
      return {
        code: "ytdlp_error",
        message:
          `Download failed with exit code ${exitCode}`
      };
    }

    const stderrLower =
      stderr.toLowerCase();

    if (
      stderrLower.includes(
        "private video"
      ) ||
      stderrLower.includes(
        "members-only"
      )
    ) {
      return {
        code: "video_private",
        message:
          "Video is private or members-only"
      };
    }

    if (
      stderrLower.includes(
        "video unavailable"
      ) ||
      stderrLower.includes(
        "not available"
      )
    ) {
      return {
        code: "video_unavailable",
        message:
          "Video is unavailable or was removed"
      };
    }

    if (
      stderrLower.includes(
        "unsupported url"
      )
    ) {
      return {
        code: "unsupported_url",
        message:
          "URL is not supported"
      };
    }

    if (
      stderrLower.includes(
        "http error 4"
      ) ||
      stderrLower.includes(
        "403"
      ) ||
      stderrLower.includes(
        "404"
      )
    ) {
      return {
        code: "video_unavailable",
        message:
          "Video not found or access denied (HTTP 4xx)"
      };
    }

    if (
      stderrLower.includes(
        "http error 5"
      ) ||
      stderrLower.includes(
        "502"
      ) ||
      stderrLower.includes(
        "503"
      )
    ) {
      return {
        code: "network_error",
        message:
          "Server error - try again later (HTTP 5xx)"
      };
    }

    if (
      stderrLower.includes(
        "network error"
      ) ||
      stderrLower.includes(
        "connection error"
      ) ||
      stderrLower.includes(
        "timeout error"
      )
    ) {
      return {
        code: "network_error",
        message:
          "Network error - check your connection"
      };
    }

    if (
      stderrLower.includes(
        "ffmpeg error"
      ) ||
      stderrLower.includes(
        "ffmpeg failed"
      ) ||
      stderrLower.includes(
        "postprocessor error"
      )
    ) {
      return {
        code: "ffmpeg_error",
        message:
          "FFmpeg processing failed - check FFmpeg installation"
      };
    }

    return {
      code: "ytdlp_error",
      message:
        `Download failed with exit code ${exitCode}`
    };
  }

  /**
   * Updates item in memory
   */
  private updateItemStatus(
    id: string,
    status: DownloadStatus,
    updates?: Partial<DownloadItem>
  ): void {
    const item =
      this.items.get(id);

    if (!item) {
      return;
    }

    this.items.set(
      id,
      {
        ...item,
        status,
        ...updates,
        lastUpdatedAt:
          Date.now()
      }
    );
  }

  /**
   * Get all download items
   */
  async getAll(): Promise<
    DownloadItem[]
  > {
    return Array.from(
      this.items.values()
    );
  }

  /**
   * Add download item to queue
   */
  async add(
    item: DownloadItem
  ): Promise<DownloadItem> {
    this.items.set(
      item.id,
      item
    );

    return item;
  }

  /**
   * Start download
   */
  async start(
    id: string
  ): Promise<DownloadItem> {
    const item =
      this.items.get(id);

    if (!item) {
      throw new Error(
        `Download item not found: ${id}`
      );
    }

    const activeCount =
      Array.from(
        this.items.values()
      ).filter(
        (i) =>
          i.id !== id &&
          [
            "downloading",
            "retrying",
            "merging",
            "converting"
          ].includes(i.status)
      ).length;

    if (
      activeCount >=
      this.settings.concurrentDownloads
    ) {
      throw new Error(
        "Concurrent download limit reached"
      );
    }

    try {
      await this.spawnDownload(
        item,
        false
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unknown error";

      const errorCode:
        import(
        "../../src/types/errors"
        ).AppErrorCode =
        "ytdlp_error";

      this.updateItemStatus(
        id,
        "failed",
        {
          errorCode,
          errorMessage,
          speed: 0,
          eta: "--"
        }
      );

      this.emitStateChange(
        id,
        "failed",
        errorCode,
        errorMessage
      );

      throw err;
    }

    return this.items.get(id)!;
  }

  /**
   * Pause download
   *
   * Kill process + keep partial file.
   */
  async pause(
    id: string
  ): Promise<DownloadItem> {
    const item =
      this.items.get(id);

    if (!item) {
      throw new Error(
        `Download item not found: ${id}`
      );
    }

    console.log(
      `[Download] PAUSE requested for: ${id} (current status: ${item.status})`
    );

    const activeDownload =
      this.activeDownloads.get(id);

    if (
      activeDownload &&
      activeDownload.process
    ) {
      console.log(
        `[Download] ✓ Found active process for ${id}, marking as stopped...`
      );

      activeDownload.isStopped =
        true;

      const proc =
        activeDownload.process;

      if (
        proc.stdout &&
        typeof proc.stdout.destroy ===
        "function"
      ) {
        proc.stdout.destroy();

        console.log(
          `[Download] ✓ Closed stdout stream for ${id}`
        );
      }

      if (
        proc.stderr &&
        typeof proc.stderr.destroy ===
        "function"
      ) {
        proc.stderr.destroy();

        console.log(
          `[Download] ✓ Closed stderr stream for ${id}`
        );
      }

      if (
        proc.stdin &&
        typeof proc.stdin.destroy ===
        "function"
      ) {
        proc.stdin.destroy();

        console.log(
          `[Download] ✓ Closed stdin stream for ${id}`
        );
      }

      this.killProcessTree(
        proc
      );

      this.activeDownloads.delete(
        id
      );

      this.nextProcessGeneration(
        id
      );

      console.log(
        `[Download] ✓ Process killed for ${id}, incremented generation to prevent auto-restart`
      );
    } else {
      console.log(
        `[Download] ⚠ No active process found for ${id} (activeDownload exists: ${!!activeDownload}, has process: ${!!activeDownload?.process})`
      );
    }

    const fileName =
      `${item.title.replace(
        /[<>:"/\\|?*]/g,
        "_"
      )}.${item.format}`;

    const outputDir =
      this.resolveDownloadFolder(
        this.settings.downloadFolder
      );

    const outputPath =
      path.join(
        outputDir,
        fileName
      );

    try {
      const stat =
        await fs.stat(
          outputPath
        );

      const actualSize =
        stat.size;

      const isNearComplete =
        actualSize >=
        item.fileSize * 0.9;

      const isEqual =
        actualSize >=
        item.fileSize * 0.99;

      const shouldComplete =
        actualSize > 0 &&
        (
          item.progress >= 95 ||
          isNearComplete ||
          isEqual
        );

      if (shouldComplete) {
        console.log(
          `[Download] File is ${Math.round((actualSize / (item.fileSize || 1)) * 100)}% complete, marking as completed instead of paused`
        );

        this.updateItemStatus(
          id,
          "completed",
          {
            progress: 100,
            fileSize:
              actualSize,
            downloadedSize:
              actualSize,
            speed: 0,
            eta: "--"
          }
        );

        this.emitStateChange(
          id,
          "completed"
        );

        return this.items.get(id)!;
      }
    } catch {
      console.log(
        `[Download] Output file doesn't exist yet or can't be accessed`
      );
    }

    const currentItem =
      this.items.get(id);

    console.log(
      `[Download] ✓ Setting status to PAUSED for ${id} (progress: ${currentItem?.progress ?? 0}%)`
    );

    this.updateItemStatus(
      id,
      "paused",
      {
        speed: 0,
        eta: "--",
        progress:
          currentItem?.progress ??
          0,
        downloadedSize:
          currentItem?.downloadedSize ??
          0
      }
    );

    this.emitStateChange(
      id,
      "paused"
    );

    return this.items.get(id)!;
  }

  /**
   * Resume download
   */
  async resume(
    id: string
  ): Promise<DownloadItem> {
    const item =
      this.items.get(id);

    if (!item) {
      throw new Error(
        `Download item not found: ${id}`
      );
    }

    if (
      item.status !==
      "paused"
    ) {
      throw new Error(
        `Cannot resume download in status: ${item.status}`
      );
    }

    const activeCount =
      Array.from(
        this.items.values()
      ).filter(
        (i) =>
          i.id !== id &&
          [
            "downloading",
            "retrying",
            "merging",
            "converting"
          ].includes(i.status)
      ).length;

    if (
      activeCount >=
      this.settings.concurrentDownloads
    ) {
      throw new Error(
        "Concurrent download limit reached"
      );
    }

    console.log(
      `[Download] RESUME requested for: ${id}`
    );

    console.log(
      `[Download] Current progress: ${item.progress}%, downloaded: ${item.downloadedSize} bytes`
    );

    try {
      console.log(
        `[Download] Attempting to resume with --continue flag...`
      );

      await this.spawnDownload(
        item,
        true
      );

      console.log(
        `[Download] ✓ Resume started successfully: ${id}`
      );

      return this.items.get(id)!;
    } catch (resumeErr) {
      const resumeErrorMsg =
        resumeErr instanceof Error
          ? resumeErr.message
          : "Resume failed";

      console.warn(
        `[Download] ⚠ Resume failed: ${resumeErrorMsg}, attempting fresh download...`
      );

      try {
        const fileName =
          `${item.title.replace(
            /[<>:"/\\|?*]/g,
            "_"
          )}.${item.format}`;

        const outputDir =
          this.resolveDownloadFolder(
            this.settings.downloadFolder
          );

        const outputPath =
          path.join(
            outputDir,
            fileName
          );

        console.log(
          `[Download] Cleaning up artifacts for fresh download: ${outputPath}`
        );

        await this.cleanupStaleDownloadArtifacts(
          outputPath
        );

        const freshItem:
          DownloadItem = {
          ...item,
          progress: 0,
          downloadedSize: 0,
          speed: 0,
          eta: "--",
          errorCode:
            undefined,
          errorMessage:
            undefined
        };

        this.items.set(
          id,
          freshItem
        );

        console.log(
          `[Download] Starting fresh download after resume failed: ${id}`
        );

        await this.spawnDownload(
          freshItem,
          false
        );

        console.log(
          `[Download] ✓ Fresh download started after resume fallback: ${id}`
        );

        return this.items.get(
          id
        )!;
      } catch (freshErr) {
        const errorMessage =
          freshErr instanceof Error
            ? freshErr.message
            : "Download failed after fallback";

        const errorCode:
          import(
          "../../src/types/errors"
          ).AppErrorCode =
          errorMessage.includes(
            "unavailable"
          )
            ? "video_unavailable"
            : errorMessage.includes(
              "network"
            )
              ? "network_error"
              : "ytdlp_error";

        console.error(
          `[Download] ✗ Both resume and fresh download failed: ${errorMessage}`
        );

        this.updateItemStatus(
          id,
          "failed",
          {
            errorCode,
            errorMessage,
            speed: 0,
            eta: "--"
          }
        );

        this.emitStateChange(
          id,
          "failed",
          errorCode,
          errorMessage
        );

        throw freshErr;
      }
    }
  }

  /**
   * Cancel download
   *
   * Kill process + preserve current files.
   */
  async cancel(
    id: string
  ): Promise<DownloadItem> {
    const item =
      this.items.get(id);

    if (!item) {
      throw new Error(
        `Download item not found: ${id}`
      );
    }

    console.log(
      `[Download] CANCEL requested for: ${id} (current status: ${item.status})`
    );

    const activeDownload =
      this.activeDownloads.get(id);

    if (
      activeDownload &&
      activeDownload.process
    ) {
      console.log(
        `[Download] ✓ Found active process for ${id}, marking as stopped...`
      );

      activeDownload.isStopped =
        true;

      const proc =
        activeDownload.process;

      if (
        proc.stdout &&
        typeof proc.stdout.destroy ===
        "function"
      ) {
        proc.stdout.destroy();

        console.log(
          `[Download] ✓ Closed stdout stream for ${id}`
        );
      }

      if (
        proc.stderr &&
        typeof proc.stderr.destroy ===
        "function"
      ) {
        proc.stderr.destroy();

        console.log(
          `[Download] ✓ Closed stderr stream for ${id}`
        );
      }

      if (
        proc.stdin &&
        typeof proc.stdin.destroy ===
        "function"
      ) {
        proc.stdin.destroy();

        console.log(
          `[Download] ✓ Closed stdin stream for ${id}`
        );
      }

      this.killProcessTree(
        proc
      );

      this.activeDownloads.delete(
        id
      );

      this.nextProcessGeneration(
        id
      );

      console.log(
        `[Download] ✓ Process killed for ${id}`
      );
    } else {
      console.log(
        `[Download] ⚠ No active process found for ${id}`
      );
    }

    const fileName =
      `${item.title.replace(
        /[<>:"/\\|?*]/g,
        "_"
      )}.${item.format}`;

    const outputDir =
      this.resolveDownloadFolder(
        this.settings.downloadFolder
      );

    const outputPath =
      path.join(
        outputDir,
        fileName
      );

    try {
      const stat =
        await fs.stat(
          outputPath
        );

      const actualSize =
        stat.size;

      const isNearComplete =
        actualSize >=
        item.fileSize * 0.9;

      const isEqual =
        actualSize >=
        item.fileSize * 0.99;

      const shouldComplete =
        actualSize > 0 &&
        (
          item.progress >= 95 ||
          isNearComplete ||
          isEqual
        );

      if (shouldComplete) {
        console.log(
          `[Download] File is ${Math.round((actualSize / (item.fileSize || 1)) * 100)}% complete, marking as completed instead of canceled`
        );

        this.updateItemStatus(
          id,
          "completed",
          {
            progress: 100,
            fileSize:
              actualSize,
            downloadedSize:
              actualSize,
            speed: 0,
            eta: "--"
          }
        );

        this.emitStateChange(
          id,
          "completed"
        );

        return this.items.get(id)!;
      }
    } catch {
      console.log(
        `[Download] Output file doesn't exist yet or can't be accessed`
      );
    }

    const currentItem =
      this.items.get(id);

    console.log(
      `[Download] ✓ Setting status to CANCELED for ${id} (progress: ${currentItem?.progress ?? 0}%)`
    );

    this.updateItemStatus(
      id,
      "canceled",
      {
        speed: 0,
        eta: "--",
        progress:
          currentItem?.progress ??
          0,
        downloadedSize:
          currentItem?.downloadedSize ??
          0
      }
    );

    this.emitStateChange(
      id,
      "canceled"
    );

    return this.items.get(id)!;
  }

  /**
   * Retry failed/canceled download
   */
  async retry(
    id: string
  ): Promise<DownloadItem> {
    const item =
      this.items.get(id);

    if (!item) {
      throw new Error(
        `Download item not found: ${id}`
      );
    }

    if (
      item.status !==
      "failed" &&
      item.status !==
      "canceled"
    ) {
      throw new Error(
        `Cannot retry download in status: ${item.status}`
      );
    }

    const activeCount =
      Array.from(
        this.items.values()
      ).filter(
        (i) =>
          i.id !== id &&
          [
            "downloading",
            "retrying",
            "merging",
            "converting"
          ].includes(i.status)
      ).length;

    if (
      activeCount >=
      this.settings.concurrentDownloads
    ) {
      throw new Error(
        "Concurrent download limit reached"
      );
    }

    const shouldResume =
      true;

    const resetItem:
      DownloadItem = {
      ...item,
      status: "retrying",
      speed: 0,
      eta: "--",
      retryCount:
        item.retryCount + 1,
      errorCode:
        undefined,
      errorMessage:
        undefined,
      lastUpdatedAt:
        Date.now()
    };

    this.items.set(
      id,
      resetItem
    );

    this.emitStateChange(
      id,
      "retrying"
    );

    setTimeout(() => {
      void this.spawnDownload(
        resetItem,
        shouldResume
      );
    }, 0);

    return (
      this.items.get(id) ??
      resetItem
    );
  }

  /**
   * Remove download item
   */
  async remove(
    id: string
  ): Promise<string> {
    const activeDownload =
      this.activeDownloads.get(id);

    if (
      activeDownload &&
      activeDownload.process
    ) {
      activeDownload.process.kill();

      this.activeDownloads.delete(
        id
      );

      this.nextProcessGeneration(
        id
      );
    }

    this.items.delete(
      id
    );

    return id;
  }

  /**
   * Reorder downloads
   */
  async reorder(
    orderedIds: string[]
  ): Promise<DownloadItem[]> {
    const result:
      DownloadItem[] = [];

    for (
      const id of orderedIds
    ) {
      const item =
        this.items.get(id);

      if (item) {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Get count of active downloads
   */
  getActiveCount(): number {
    return Array.from(
      this.items.values()
    ).filter(
      (i) =>
        [
          "downloading",
          "retrying",
          "merging",
          "converting"
        ].includes(i.status)
    ).length;
  }

  /**
   * Clean up all active downloads
   * Called on app shutdown.
   */
  cleanup(): void {
    for (
      const [
        id,
        activeDownload
      ] of this.activeDownloads.entries()
    ) {
      activeDownload.isStopped =
        true;

      this.nextProcessGeneration(
        id
      );

      if (
        activeDownload.process
      ) {
        activeDownload.process.kill();
      }

      const item =
        this.items.get(id);

      if (
        item &&
        [
          "downloading",
          "retrying",
          "merging",
          "converting"
        ].includes(item.status)
      ) {
        this.updateItemStatus(
          id,
          "canceled",
          {
            speed: 0,
            eta: "--"
          }
        );
      }
    }

    this.activeDownloads.clear();
    this.processGenerations.clear();
  }
}