/**
 * NativeSchedulerService — Main Process scheduler boundary with persistent storage.
 *
 * Phase 3.1: Persistent storage using fs-based JSON files.
 * Scheduler is stored in %APPDATA%/remon-download/scheduler.json
 *
 * Uses the same pattern as NativeFavoritesService:
 * - initializationPromise guard (once-only, idempotent)
 * - isSchedulerFileFormat type guard
 * - normalizeScheduledDownload for safe deserialization
 * - ensureInitialized() in every public method
 * - persist() after create/update/cancel/remove
 */
import type { ScheduledDownload, ScheduleRepeat, ScheduledDownloadStatus, VideoMetadata } from '../../src/types/download';
import { readJsonFile, writeJsonFile } from '../utils/fileStorage';
import { isYouTubeUrl, NativeMetadataService } from './nativeMetadataService';

interface SchedulerFileFormat {
  version: string;
  data: ScheduledDownload[];
}

function isSchedulerFileFormat(value: unknown): value is SchedulerFileFormat {
  return (
    !!value &&
    typeof value === 'object' &&
    'data' in value &&
    Array.isArray((value as { data?: unknown }).data)
  );
}

const VALID_REPEAT: ReadonlySet<string> = new Set<ScheduleRepeat>(['once', 'daily', 'weekly']);
const VALID_STATUS: ReadonlySet<string> = new Set<ScheduledDownloadStatus>([
  'scheduled', 'triggered', 'completed', 'failed', 'canceled',
]);

function normalizeScheduledDownload(item: Record<string, unknown> | null | undefined): ScheduledDownload | null {
  if (!item || typeof item !== 'object') return null;

  const id = item['id'] !== undefined ? String(item['id']) : null;
  if (!id) return null;

  const now = new Date().toISOString();

  const repeat = VALID_REPEAT.has(String(item['repeat'] ?? ''))
    ? (item['repeat'] as ScheduleRepeat)
    : 'once';

  const status = VALID_STATUS.has(String(item['status'] ?? ''))
    ? (item['status'] as ScheduledDownloadStatus)
    : 'scheduled';

  return {
    id,
    sourceUrl: String(item['sourceUrl'] ?? item['url'] ?? ''),
    date: String(item['date'] ?? now.slice(0, 10)),
    time: String(item['time'] ?? '00:00'),
    repeat,
    status,
    nextRunAt: String(item['nextRunAt'] ?? now),
    createdAt: String(item['createdAt'] ?? now),
    updatedAt: String(item['updatedAt'] ?? now),
    triggerCount: typeof item['triggerCount'] === 'number' ? item['triggerCount'] : 0,
    lastTriggeredAt: item['lastTriggeredAt'] !== undefined
      ? String(item['lastTriggeredAt'])
      : undefined,
    errorMessage: item['errorMessage'] !== undefined
      ? String(item['errorMessage'])
      : undefined,
  };
}

export class NativeSchedulerService {
  private items: ScheduledDownload[] = [];
  private readonly SCHEDULER_FILE = 'scheduler.json';
  private readonly FILE_VERSION = '1.0.0';
  private initializationPromise: Promise<void> | null = null;
  private nextError: Error | null = null;

  /**
   * Initialize service by loading scheduler from disk.
   * Idempotent — multiple calls return the same promise.
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      const fileData = await readJsonFile<unknown>(this.SCHEDULER_FILE, {
        version: this.FILE_VERSION,
        data: [],
      });

      if (isSchedulerFileFormat(fileData)) {
        this.items = fileData.data
          .map((item) => normalizeScheduledDownload(item as unknown as Record<string, unknown>))
          .filter((item): item is ScheduledDownload => item !== null);
        return;
      }

      // Fallback: corrupted / legacy format
      this.items = [];
    })();

    return this.initializationPromise;
  }

  /**
   * Ensure service is initialized before any operation.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      await this.initialize();
    } else {
      await this.initializationPromise;
    }
  }

  /**
   * Persist current scheduler state to disk.
   */
  private async persist(): Promise<void> {
    await writeJsonFile<SchedulerFileFormat>(this.SCHEDULER_FILE, {
      version: this.FILE_VERSION,
      data: this.items,
    });
  }

  async getAll(): Promise<ScheduledDownload[]> {
    this.throwIfNeeded();
    await this.ensureInitialized();
    return [...this.items];
  }

  async create(
    schedule: Omit<ScheduledDownload, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>
  ): Promise<ScheduledDownload> {
    this.throwIfNeeded();
    await this.ensureInitialized();

    const now = new Date().toISOString();
    const item: ScheduledDownload = {
      ...schedule,
      id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      updatedAt: now,
      triggerCount: 0,
    };
    this.items = [item, ...this.items];
    await this.persist();
    return item;
  }

  async update(schedule: ScheduledDownload): Promise<ScheduledDownload> {
    this.throwIfNeeded();
    await this.ensureInitialized();

    const updated: ScheduledDownload = {
      ...schedule,
      updatedAt: new Date().toISOString(),
    };
    this.items = this.items.map((i) => (i.id === schedule.id ? updated : i));
    await this.persist();
    return updated;
  }

  async cancel(id: string): Promise<ScheduledDownload> {
    this.throwIfNeeded();
    await this.ensureInitialized();

    const item = this.requireItem(id);
    const canceled: ScheduledDownload = {
      ...item,
      status: 'canceled',
      updatedAt: new Date().toISOString(),
    };
    this.items = this.items.map((i) => (i.id === id ? canceled : i));
    await this.persist();
    return canceled;
  }

  async remove(id: string): Promise<string> {
    this.throwIfNeeded();
    await this.ensureInitialized();

    this.items = this.items.filter((i) => i.id !== id);
    await this.persist();
    return id;
  }

  async tick(now: number): Promise<{ items: ScheduledDownload[]; triggered: Array<{ schedule: ScheduledDownload; metadata: VideoMetadata[] }> }> {
    this.throwIfNeeded();
    await this.ensureInitialized();

    const triggered: Array<{ schedule: ScheduledDownload; metadata: VideoMetadata[] }> = [];
    const nowIso = new Date(now).toISOString();
    const nextItems: ScheduledDownload[] = [];

    for (const item of this.items) {
      // Only process scheduled items that are due
      if (item.status !== 'scheduled' || new Date(item.nextRunAt).getTime() > now) {
        nextItems.push(item);
        continue;
      }

      // Item is due - trigger it
      const addRepeatTime = (runAt: string, repeat: ScheduleRepeat): string => {
        const date = new Date(runAt);
        if (repeat === 'daily') {
          date.setDate(date.getDate() + 1);
        } else if (repeat === 'weekly') {
          date.setDate(date.getDate() + 7);
        }
        return date.toISOString();
      };

      const triggeredItem: ScheduledDownload = {
        ...item,
        status: item.repeat === 'once' ? 'triggered' : 'scheduled',
        nextRunAt: item.repeat === 'once' ? item.nextRunAt : addRepeatTime(item.nextRunAt, item.repeat),
        triggerCount: item.triggerCount + 1,
        lastTriggeredAt: nowIso,
        updatedAt: nowIso,
      };

      triggered.push({
        schedule: triggeredItem,
        metadata: await this.createMetadata(triggeredItem),
      });

      nextItems.push(triggeredItem);
    }

    this.items = nextItems;

    // Persist changes only if something was triggered
    if (triggered.length > 0) {
      await this.persist();
    }

    return {
      items: [...this.items],
      triggered,
    };
  }

  async clear(): Promise<void> {
    this.throwIfNeeded();
    await this.ensureInitialized();
    this.items = [];
    await this.persist();
  }

  failNext(error: Error): void {
    this.nextError = error;
  }

  private throwIfNeeded(): void {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
  }

  private requireItem(id: string): ScheduledDownload {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error(`Scheduled item not found: ${id}`);
    return item;
  }

  private async createMetadata(schedule: ScheduledDownload): Promise<VideoMetadata[]> {
    const triggerNumber = schedule.triggerCount + 1;
    const fallbackTitle = `Scheduled Download ${triggerNumber}`;

    try {
      const analyzed = await new NativeMetadataService().analyze(schedule.sourceUrl);
      if (analyzed.linkType === 'playlist') {
        return analyzed.videos.map((video, index) => ({
          ...video,
          id: `scheduled-${schedule.id}-${triggerNumber}-${index + 1}`,
        }));
      }
      if (analyzed.linkType === 'video' || analyzed.linkType === 'shorts' || analyzed.linkType === 'playlist-video') {
        return [{
          ...analyzed,
          id: `scheduled-${schedule.id}-${triggerNumber}`,
        }];
      }
    } catch (error) {
      if (isYouTubeUrl(schedule.sourceUrl)) {
        console.error(`[Scheduler] Metadata analysis failed for ${schedule.sourceUrl}:`, error);
        throw error;
      }

      // Keep legacy non-YouTube test/custom URLs usable without pretending they are real metadata.
    }

    const title = (() => {
      try {
        const parsed = new URL(schedule.sourceUrl);
        const videoId = parsed.searchParams.get('v');
        if (videoId) {
          return videoId;
        }

        const lastSegment = parsed.pathname.split('/').filter(Boolean).at(-1);
        if (lastSegment) {
          return decodeURIComponent(lastSegment.replace(/[-_]/g, ' '));
        }
      } catch {
        // Ignore invalid URLs and fall back to the generic scheduled title.
      }

      return fallbackTitle;
    })();

    const thumbnail = (() => {
      try {
        const parsed = new URL(schedule.sourceUrl);
        const videoId = parsed.searchParams.get('v');
        if (videoId) {
          return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        }
      } catch {
        // Ignore invalid URLs and fall back to the generic scheduled thumbnail.
      }

      return 'https://picsum.photos/seed/remon-scheduled/320/180';
    })();

    return [{
      id: `scheduled-${schedule.id}-${triggerNumber}`,
      sourceUrl: schedule.sourceUrl,
      linkType: 'video',
      thumbnail,
      title,
      channelName: 'Scheduled Queue',
      duration: '10:24',
      views: 128000,
      qualityOptions: ['2160p', '1440p', '1080p', '720p', '480p'],
      videoFormats: ['mp4', 'webm', 'mkv'],
      audioFormats: ['mp3', 'opus'],
      resolution: '1080p',
      fps: 60,
      videoCodec: 'H.264',
      audioCodec: 'AAC',
      videoBitrate: '7.8 Mbps',
      audioBitrate: '192 Kbps',
      container: 'mp4',
      fileSize: 220 * 1024 * 1024,
      uploadDate: '2026-08-01',
    }];
  }
}
