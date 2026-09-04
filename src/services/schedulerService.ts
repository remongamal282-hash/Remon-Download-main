import type { AnalysisResult, ScheduledDownload, ScheduleRepeat, VideoMetadata } from "../types/download";
import { metadataService } from "./metadataService";
import type { ErrorModel } from "../types/errors";

export interface SchedulerInput {
  sourceUrl: string;
  date: string;
  time: string;
  repeat: ScheduleRepeat;
}

export interface SchedulerTickResult {
  items: ScheduledDownload[];
  triggered: Array<{
    schedule: ScheduledDownload;
    metadata: VideoMetadata[];
  }>;
}

export interface SchedulerService {
  getAll(): Promise<ScheduledDownload[]>;
  create(input: SchedulerInput): Promise<ScheduledDownload>;
  update(id: string, input: SchedulerInput): Promise<ScheduledDownload>;
  cancel(id: string): Promise<ScheduledDownload>;
  remove(id: string): Promise<void>;
  tick(now: number): Promise<SchedulerTickResult>;
  clear(): Promise<void>;
  failNext(error: ErrorModel): void;
}

function buildRunAt(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function addRepeatTime(runAt: string, repeat: ScheduleRepeat): string {
  const date = new Date(runAt);

  if (repeat === "daily") {
    date.setDate(date.getDate() + 1);
  } else if (repeat === "weekly") {
    date.setDate(date.getDate() + 7);
  }

  return date.toISOString();
}

function deriveVideoTitle(sourceUrl: string, fallback: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const videoId = parsed.searchParams.get("v");

    if (videoId) {
      return videoId;
    }

    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment) {
      return decodeURIComponent(lastSegment.replace(/[-_]/g, " "));
    }
  } catch {
    // Ignore invalid URLs and fall back to the scheduled fallback title.
  }

  return fallback;
}

function deriveVideoThumbnail(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const videoId = parsed.searchParams.get("v");

    if (videoId) {
      return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
  } catch {
    // Ignore invalid URLs and fall back to the generic scheduled thumbnail.
  }

  return "https://picsum.photos/seed/remon-scheduled/320/180";
}

async function createMetadata(schedule: ScheduledDownload): Promise<VideoMetadata[]> {
  const triggerNumber = schedule.triggerCount + 1;
  const fallbackTitle = `Scheduled Download ${triggerNumber}`;

  try {
    const analyzed: AnalysisResult = await metadataService.analyze(schedule.sourceUrl);
    if (analyzed.linkType === "playlist") {
      return analyzed.videos.map((video, index) => ({
        ...video,
        id: `scheduled-${schedule.id}-${triggerNumber}-${index + 1}`
      }));
    }

    if (analyzed.linkType !== "channel") {
      return [{
        ...analyzed,
        id: `scheduled-${schedule.id}-${triggerNumber}`
      }];
    }
  } catch {
    // Fall back to URL-based metadata when analysis fails.
  }

  return [{
    id: `scheduled-${schedule.id}-${triggerNumber}`,
    sourceUrl: schedule.sourceUrl,
    linkType: "video",
    thumbnail: deriveVideoThumbnail(schedule.sourceUrl),
    title: deriveVideoTitle(schedule.sourceUrl, fallbackTitle),
    channelName: "Scheduled Queue",
    duration: "10:24",
    views: 128000,
    qualityOptions: ["2160p", "1440p", "1080p", "720p", "480p"],
    videoFormats: ["mp4", "webm", "mkv"],
    audioFormats: ["mp3", "opus"],
    resolution: "1080p",
    fps: 60,
    videoCodec: "H.264",
    audioCodec: "AAC",
    videoBitrate: "7.8 Mbps",
    audioBitrate: "192 Kbps",
    container: "mp4",
    fileSize: 220 * 1024 * 1024,
    uploadDate: "2026-08-01"
  }];
}

export class MockSchedulerService implements SchedulerService {
  private items: ScheduledDownload[] = [];
  private nextError: ErrorModel | null = null;

  async getAll(): Promise<ScheduledDownload[]> {
    await this.delay();
    this.throwIfNeeded();
    return [...this.items];
  }

  async create(input: SchedulerInput): Promise<ScheduledDownload> {
    await this.delay();
    this.throwIfNeeded();

    const now = new Date().toISOString();
    const item: ScheduledDownload = {
      id: crypto.randomUUID(),
      sourceUrl: input.sourceUrl,
      date: input.date,
      time: input.time,
      repeat: input.repeat,
      status: "scheduled",
      nextRunAt: buildRunAt(input.date, input.time),
      createdAt: now,
      updatedAt: now,
      triggerCount: 0
    };

    this.items = [item, ...this.items];
    return item;
  }

  async update(id: string, input: SchedulerInput): Promise<ScheduledDownload> {
    await this.delay();
    this.throwIfNeeded();

    const existing = this.find(id);
    const updated: ScheduledDownload = {
      ...existing,
      sourceUrl: input.sourceUrl,
      date: input.date,
      time: input.time,
      repeat: input.repeat,
      status: "scheduled",
      nextRunAt: buildRunAt(input.date, input.time),
      updatedAt: new Date().toISOString(),
      errorMessage: undefined
    };

    this.items = this.items.map((item) => (item.id === id ? updated : item));
    return updated;
  }

  async cancel(id: string): Promise<ScheduledDownload> {
    await this.delay();
    this.throwIfNeeded();

    const existing = this.find(id);
    const canceled: ScheduledDownload = {
      ...existing,
      status: "canceled",
      updatedAt: new Date().toISOString()
    };

    this.items = this.items.map((item) => (item.id === id ? canceled : item));
    return canceled;
  }

  async remove(id: string): Promise<void> {
    await this.delay();
    this.throwIfNeeded();
    this.items = this.items.filter((item) => item.id !== id);
  }

  async tick(now: number): Promise<SchedulerTickResult> {
    this.throwIfNeeded();

    const triggered: SchedulerTickResult["triggered"] = [];
    const nowIso = new Date(now).toISOString();

    const nextItems: ScheduledDownload[] = [];

    for (const item of this.items) {
      if (item.status !== "scheduled" || new Date(item.nextRunAt).getTime() > now) {
        nextItems.push(item);
        continue;
      }

      const triggeredItem: ScheduledDownload = {
        ...item,
        status: item.repeat === "once" ? "triggered" : "scheduled",
        nextRunAt: item.repeat === "once" ? item.nextRunAt : addRepeatTime(item.nextRunAt, item.repeat),
        triggerCount: item.triggerCount + 1,
        lastTriggeredAt: nowIso,
        updatedAt: nowIso
      };

      triggered.push({
        schedule: triggeredItem,
        metadata: await createMetadata(item)
      });

      nextItems.push(triggeredItem);
    }

    this.items = nextItems;

    return {
      items: [...this.items],
      triggered
    };
  }

  async clear(): Promise<void> {
    await this.delay();
    this.throwIfNeeded();
    this.items = [];
  }

  failNext(error: ErrorModel): void {
    this.nextError = error;
  }

  private find(id: string): ScheduledDownload {
    const item = this.items.find((candidate) => candidate.id === id);

    if (!item) {
      throw {
        code: "unknown",
        message: "scheduler.errors.notFound",
        recoverable: true
      } satisfies ErrorModel;
    }

    return item;
  }

  private async delay(): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  private throwIfNeeded(): void {
    if (!this.nextError) {
      return;
    }

    const error = this.nextError;
    this.nextError = null;
    throw error;
  }
}

export const schedulerService: SchedulerService = new MockSchedulerService();
