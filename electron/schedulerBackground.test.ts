import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadItem, ScheduledDownload, VideoMetadata } from '../src/types/download';
import { SchedulerBackgroundLoop } from './schedulerBackground';

function makeMetadata(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    id: 'meta-1',
    sourceUrl: 'https://example.com/video',
    linkType: 'video',
    thumbnail: 'https://example.com/thumb.jpg',
    title: 'Scheduled Video',
    channelName: 'Channel',
    duration: '03:15',
    views: 123456,
    qualityOptions: ['1080p'],
    videoFormats: ['mp4'],
    audioFormats: ['mp3'],
    resolution: '1080p',
    fps: 30,
    videoCodec: 'H.264',
    audioCodec: 'AAC',
    videoBitrate: '5 Mbps',
    audioBitrate: '192 Kbps',
    container: 'mp4',
    fileSize: 1024 * 1024,
    uploadDate: '2024-01-01',
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<ScheduledDownload> = {}): ScheduledDownload {
  return {
    id: 'sched-1',
    sourceUrl: 'https://example.com/video',
    date: '2024-01-01',
    time: '12:00',
    repeat: 'once',
    status: 'scheduled',
    nextRunAt: '2024-01-01T12:00:00.000Z',
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z',
    triggerCount: 0,
    ...overrides,
  };
}

describe('SchedulerBackgroundLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with Electron Main Process and executes a due scheduled task', async () => {
    const metadata = makeMetadata();
    const schedule = makeSchedule({
      id: 'sched-1',
      status: 'triggered',
      triggerCount: 1,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const schedulerService = {
      tick: vi.fn(async () => ({
        items: [schedule],
        triggered: [{ schedule, metadata: [metadata] }],
      })),
    };

    const add = vi.fn(async (item: DownloadItem) => item);
    const start = vi.fn(async (id: string) => ({ id, status: 'downloading' }));
    const downloadService = { add, start };

    const loop = new SchedulerBackgroundLoop({
      schedulerService: schedulerService as any,
      getDownloadService: () => downloadService as any,
      getSettings: async () => ({ defaultQuality: '480p', defaultVideoFormat: 'webm' }),
      pollMs: 1000,
    });

    loop.start();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(schedulerService.tick).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(expect.any(String));
    expect(add.mock.calls[0]?.[0]).toMatchObject({ quality: '480p', format: 'webm', status: 'queued' });
    expect(loop.isRunning()).toBe(true);
    loop.stop();
  });

  it('prevents duplicate execution of the same scheduled task', async () => {
    const metadata = makeMetadata();
    const schedule = makeSchedule({
      id: 'sched-dup',
      status: 'triggered',
      triggerCount: 2,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const add = vi.fn(async (item: DownloadItem) => item);
    const start = vi.fn(async (id: string) => ({ id, status: 'downloading' }));
    const schedulerService = {
      tick: vi.fn()
        .mockResolvedValueOnce({ items: [schedule], triggered: [{ schedule, metadata: [metadata] }] })
        .mockResolvedValueOnce({ items: [schedule], triggered: [{ schedule, metadata: [metadata] }] })
    };

    const loop = new SchedulerBackgroundLoop({
      schedulerService: schedulerService as any,
      getDownloadService: () => ({ add, start }) as any,
      pollMs: 1000,
    });

    loop.start();
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(add).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    loop.stop();
  });

  it('starts one native download for every scheduled playlist video', async () => {
    const schedule = makeSchedule({ id: 'sched-playlist', status: 'triggered', triggerCount: 1 });
    const metadata = [makeMetadata({ id: 'playlist-video-1' }), makeMetadata({ id: 'playlist-video-2' })];
    const add = vi.fn(async (item: DownloadItem) => item);
    const start = vi.fn(async (id: string) => ({ id, status: 'downloading' }));
    const schedulerService = {
      tick: vi.fn(async () => ({ items: [schedule], triggered: [{ schedule, metadata }] }))
    };

    const loop = new SchedulerBackgroundLoop({
      schedulerService: schedulerService as any,
      getDownloadService: () => ({ add, start }) as any,
      pollMs: 1000,
    });

    await loop.tickOnce(Date.now());

    expect(add).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('queues remaining scheduled playlist videos when the concurrent limit is one', async () => {
    const schedule = makeSchedule({ id: 'sched-limited', status: 'triggered', triggerCount: 1 });
    const metadata = [makeMetadata({ id: 'playlist-video-1' }), makeMetadata({ id: 'playlist-video-2' })];
    const add = vi.fn(async (item: DownloadItem) => item);
    const start = vi.fn()
      .mockResolvedValueOnce({ id: 'scheduled-1', status: 'downloading' })
      .mockRejectedValueOnce(new Error('Concurrent download limit reached'))
      .mockResolvedValueOnce({ id: 'scheduled-2', status: 'downloading' });
    const schedulerService = {
      tick: vi.fn(async () => ({ items: [schedule], triggered: [{ schedule, metadata }] })),
      update: vi.fn(async () => schedule)
    };
    const listeners: Array<(payload: any) => void> = [];
    const downloadService = {
      add,
      start,
      on: vi.fn((_event: string, listener: (payload: any) => void) => listeners.push(listener))
    };
    const loop = new SchedulerBackgroundLoop({
      schedulerService: schedulerService as any,
      getDownloadService: () => downloadService as any,
      pollMs: 1000,
    });

    await loop.tickOnce(Date.now());
    expect(add).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledTimes(2);

    listeners[0]?.({ id: add.mock.calls[0]?.[0].id, status: 'completed', progress: 100, downloadedSize: 1, fileSize: 1, speed: 0, eta: '--' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(start).toHaveBeenCalledTimes(3);
  });

  it('works without a SchedulerPage and can be stopped cleanly', async () => {
    const schedulerService = {
      tick: vi.fn(async () => ({ items: [], triggered: [] })),
    };

    const loop = new SchedulerBackgroundLoop({
      schedulerService: schedulerService as any,
      getDownloadService: () => null,
      pollMs: 1000,
    });

    loop.start();
    expect(loop.isRunning()).toBe(true);
    expect(loop.hasActiveTimer()).toBe(true);

    loop.stop();
    expect(loop.isRunning()).toBe(false);
    expect(loop.hasActiveTimer()).toBe(false);
  });
});
