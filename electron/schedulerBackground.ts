import type { DownloadItem, ScheduledDownload, VideoMetadata } from "../src/types/download";
import { NativeDownloadService } from "./services/nativeDownloadService";
import { NativeSchedulerService } from "./services/nativeSchedulerService";
import { NativeNotificationService } from "./services/nativeNotificationService";
import { NativeSettingsService } from "./services/nativeSettingsService";
import type { DownloadStateChangePayload } from "./ipc/channels";

export interface SchedulerBackgroundLoopOptions {
  schedulerService?: NativeSchedulerService;
  getDownloadService?: () => NativeDownloadService | null;
  getNotificationService?: () => NativeNotificationService | null;
  getSettings?: () => Promise<{ defaultQuality: string; defaultVideoFormat: string }>;
  pollMs?: number;
  logger?: Pick<Console, "log" | "warn" | "error">;
}

export class SchedulerBackgroundLoop {
  private readonly schedulerService: NativeSchedulerService;
  private readonly getDownloadService: () => NativeDownloadService | null;
  private readonly pollMs: number;
  private readonly getNotificationService: () => NativeNotificationService | null;
  private readonly logger: Pick<Console, "log" | "warn" | "error">;
  private readonly getSettings: () => Promise<{ defaultQuality: string; defaultVideoFormat: string }>;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private tickInFlight = false;
  private activeExecutionIds = new Set<string>();
  private lastTriggeredBySchedule = new Map<string, number>();
  private scheduledDownloadIds = new Map<string, { schedule: ScheduledDownload; item: DownloadItem }>();
  private downloadListenerAttached = false;

  constructor(options: SchedulerBackgroundLoopOptions = {}) {
    this.schedulerService = options.schedulerService ?? new NativeSchedulerService();
    this.getDownloadService = options.getDownloadService ?? (() => null);
    this.getNotificationService = options.getNotificationService ?? (() => null);
    this.getSettings = options.getSettings ?? (async () => {
      try {
        const settingsService = new NativeSettingsService();
        await settingsService.initialize();
        const settings = await settingsService.get();
        return {
          defaultQuality: settings.defaultQuality,
          defaultVideoFormat: settings.defaultVideoFormat
        };
      } catch {
        return { defaultQuality: "720p", defaultVideoFormat: "mp4" };
      }
    });
    this.pollMs = options.pollMs ?? 1000;
    this.logger = options.logger ?? console;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastTriggeredBySchedule.clear();
    this.scheduledDownloadIds.clear();
    this.logger.log("[Main] scheduler started");

    this.timer = setInterval(() => {
      void this.tickOnce(Date.now());
    }, this.pollMs);

    void this.tickOnce(Date.now());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    this.activeExecutionIds.clear();
    this.lastTriggeredBySchedule.clear();
    this.scheduledDownloadIds.clear();
    this.logger.log("[Main] scheduler stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  hasActiveTimer(): boolean {
    return this.timer !== null;
  }

  async tickOnce(now: number): Promise<number> {
    if (this.tickInFlight) {
      this.logger.log("[Main] tick skipped: scheduler already running");
      return 0;
    }

    this.tickInFlight = true;

    try {
      this.logger.log(`[Main] scheduler tick ${new Date(now).toISOString()}`);
      const result = await this.schedulerService.tick(now);

      if (result.triggered.length === 0) {
        return 0;
      }

      this.logger.log(`[Main] scheduled task detected: ${result.triggered.length} due task(s)`);

      let startedCount = 0;
      for (const triggered of result.triggered) {
        const scheduleId = triggered.schedule.id;
        const triggerKey = triggered.schedule.triggerCount;

        if (this.activeExecutionIds.has(scheduleId) || this.lastTriggeredBySchedule.get(scheduleId) === triggerKey) {
          this.logger.warn(`[Main] duplicate scheduled task detected and skipped: ${scheduleId}`);
          continue;
        }

        this.activeExecutionIds.add(scheduleId);
        this.lastTriggeredBySchedule.set(scheduleId, triggerKey);

        try {
          await this.executeTriggeredTask(triggered.schedule, triggered.metadata);
          startedCount += 1;
        } catch (error) {
          this.logger.error(`[Main] scheduled download failed: ${scheduleId}`, error);
        } finally {
          this.activeExecutionIds.delete(scheduleId);
        }
      }

      return startedCount;
    } catch (error) {
      this.logger.error("[Main] scheduler tick failed", error);
      return 0;
    } finally {
      this.tickInFlight = false;
    }
  }

  private async executeTriggeredTask(schedule: ScheduledDownload, metadataItems: VideoMetadata[]): Promise<void> {
    const downloadService = this.getDownloadService();
    if (!downloadService) {
      this.logger.warn(`[Main] scheduler task skipped because download service is unavailable: ${schedule.id}`);
      return;
    }

    const settings = await this.getSettings();

    this.attachDownloadListener(downloadService);
    this.getNotificationService()?.notifyScheduledDownload(schedule, metadataItems[0]);

    for (const metadata of metadataItems) {
      const itemId = `${schedule.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const item: DownloadItem = {
        id: itemId,
        metadataId: metadata.id,
        thumbnail: metadata.thumbnail,
        title: metadata.title,
        sourceUrl: metadata.sourceUrl,
        quality: settings.defaultQuality,
        format: settings.defaultVideoFormat,
        fileSize: metadata.fileSize,
        downloadedSize: 0,
        speed: 0,
        eta: "--",
        progress: 0,
        status: "queued",
        order: 0,
        addedAt: new Date().toISOString(),
        phaseStartedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        retryCount: 0,
      };

      this.logger.log(`[Main] scheduled download started: ${item.id} for ${schedule.id}`);
      await downloadService.add(item);
      this.scheduledDownloadIds.set(item.id, { schedule, item });
      try {
        await downloadService.start(item.id);
        const tracked = this.scheduledDownloadIds.get(item.id);
        if (tracked) {
          tracked.item = { ...tracked.item, status: "downloading" };
          this.scheduledDownloadIds.set(item.id, tracked);
        }
      } catch (error) {
        if (error instanceof Error && error.message === "Concurrent download limit reached") {
          this.logger.log(`[Main] scheduled download queued until a slot is available: ${item.id}`);
          continue;
        }
        throw error;
      }
    }

    this.logger.log(`[Main] scheduled task completed: ${schedule.id} (${metadataItems.length} item(s))`);
  }

  private attachDownloadListener(downloadService: NativeDownloadService): void {
    if (this.downloadListenerAttached || typeof downloadService.on !== "function") {
      return;
    }

    downloadService.on("download:state-change", (payload: DownloadStateChangePayload) => {
      const trackedDownload = this.scheduledDownloadIds.get(payload.id);
      if (!trackedDownload || !["completed", "failed"].includes(payload.status)) {
        return;
      }

      this.scheduledDownloadIds.delete(payload.id);
      const updatedItem = {
        ...trackedDownload.item,
        status: payload.status,
        progress: payload.progress,
        downloadedSize: payload.downloadedSize,
        errorCode: payload.errorCode,
        errorMessage: payload.errorMessage,
        lastUpdatedAt: Date.now()
      } as DownloadItem;
      this.getNotificationService()?.handleDownloadStateChange(payload, updatedItem);
      void this.startNextQueuedDownload(downloadService);
      void this.schedulerService.update({
        ...trackedDownload.schedule,
        status: payload.status === "completed" ? "completed" : "failed",
        errorMessage: payload.errorMessage,
        updatedAt: new Date().toISOString()
      });
    });

    this.downloadListenerAttached = true;
  }

  private async startNextQueuedDownload(downloadService: NativeDownloadService): Promise<void> {
    const queued = Array.from(this.scheduledDownloadIds.entries())
      .find(([, tracked]) => tracked.item.status === "queued");
    if (!queued) {
      return;
    }

    const [itemId, tracked] = queued;
    try {
      await downloadService.start(itemId);
      tracked.item = { ...tracked.item, status: "downloading" };
      this.scheduledDownloadIds.set(itemId, tracked);
      this.logger.log(`[Main] started queued scheduled download: ${itemId}`);
    } catch (error) {
      if (!(error instanceof Error && error.message === "Concurrent download limit reached")) {
        this.logger.error(`[Main] queued scheduled download failed to start: ${itemId}`, error);
      }
    }
  }
}
