import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeSchedulerService } from './nativeSchedulerService';
import type { ScheduledDownload } from '../../src/types/download';
import * as fileStorage from '../utils/fileStorage';

// Mock fileStorage module
vi.mock('../utils/fileStorage', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ScheduledDownload> = {}): ScheduledDownload {
  return {
    id: 'sched-1',
    sourceUrl: 'https://example.com/video1',
    date: '2024-01-01',
    time: '14:30',
    repeat: 'once',
    status: 'scheduled',
    nextRunAt: '2024-01-01T14:30:00.000Z',
    createdAt: '2024-01-01T12:00:00Z',
    updatedAt: '2024-01-01T12:00:00Z',
    triggerCount: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NativeSchedulerService', () => {
  let service: NativeSchedulerService;
  let mockReadJsonFile: ReturnType<typeof vi.fn>;
  let mockWriteJsonFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReadJsonFile = vi.mocked(fileStorage.readJsonFile);
    mockWriteJsonFile = vi.mocked(fileStorage.writeJsonFile);

    // Default: empty scheduler file
    mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [] });
    mockWriteJsonFile.mockResolvedValue(undefined);

    service = new NativeSchedulerService();
  });

  // ─── initialization ───────────────────────────────────────────────────────

  describe('initialization', () => {
    it('should load scheduler from file on initialize()', async () => {
      const mockData: ScheduledDownload[] = [
        makeItem({ id: 'sched-1', repeat: 'once', status: 'scheduled' }),
        makeItem({ id: 'sched-2', time: '09:00', repeat: 'daily', status: 'scheduled', triggerCount: 5 }),
      ];

      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: mockData });

      const newService = new NativeSchedulerService();
      await newService.initialize();

      expect(mockReadJsonFile).toHaveBeenCalledWith('scheduler.json', {
        version: '1.0.0',
        data: [],
      });

      const items = await newService.getAll();
      expect(items).toEqual(mockData);
    });

    it('should start with empty array if file does not exist', async () => {
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [] });

      const newService = new NativeSchedulerService();
      await newService.initialize();

      const items = await newService.getAll();
      expect(items).toEqual([]);
    });

    it('should handle file read errors by propagating', async () => {
      mockReadJsonFile.mockRejectedValue(new Error('Permission denied'));

      const newService = new NativeSchedulerService();
      await expect(newService.initialize()).rejects.toThrow('Permission denied');
    });

    it('should fall back to empty array for legacy/corrupted (non-object) JSON', async () => {
      // Array instead of { version, data } object
      mockReadJsonFile.mockResolvedValue([makeItem()] as unknown as { version: string; data: ScheduledDownload[] });

      const newService = new NativeSchedulerService();
      await expect(newService.initialize()).resolves.toBeUndefined();

      const items = await newService.getAll();
      expect(items).toEqual([]);
    });

    it('should normalize items with unknown status to "scheduled"', async () => {
      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: [{
          id: 'sched-bad', sourceUrl: 'https://x.com', date: '2024-01-01', time: '10:00',
          repeat: 'once', status: 'INVALID_STATUS', nextRunAt: '2024-01-01T10:00:00Z',
          createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', triggerCount: 0
        }],
      });

      const newService = new NativeSchedulerService();
      await newService.initialize();

      const [item] = await newService.getAll();
      expect(item.status).toBe('scheduled');
    });

    it('should be idempotent — calling initialize() twice reads file only once', async () => {
      const newService = new NativeSchedulerService();
      mockReadJsonFile.mockClear();
      await newService.initialize();
      await newService.initialize();

      expect(mockReadJsonFile).toHaveBeenCalledTimes(1);
    });

    it('should lazy-initialize on first getAll() without explicit initialize()', async () => {
      const newService = new NativeSchedulerService();
      mockReadJsonFile.mockClear();
      const items = await newService.getAll();
      expect(items).toEqual([]);
      expect(mockReadJsonFile).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getAll ───────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('should return all scheduled items', async () => {
      const mockData = [makeItem()];
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: mockData });
      await service.initialize();

      const items = await service.getAll();
      expect(items).toEqual(mockData);
    });

    it('should return a copy of items array (not the same reference)', async () => {
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [makeItem()] });
      await service.initialize();

      const items1 = await service.getAll();
      const items2 = await service.getAll();

      expect(items1).toEqual(items2);
      expect(items1).not.toBe(items2);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a new scheduled item and persist to file', async () => {
      await service.initialize();

      const input: Omit<ScheduledDownload, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'> = {
        sourceUrl: 'https://example.com/video1',
        date: '2024-01-01',
        time: '14:30',
        repeat: 'once',
        status: 'scheduled',
        nextRunAt: '2024-01-01T14:30:00.000Z',
      };

      const result = await service.create(input);

      expect(result).toMatchObject(input);
      expect(result.id).toMatch(/^sched-/);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(result.triggerCount).toBe(0);

      expect(mockWriteJsonFile).toHaveBeenCalledWith('scheduler.json', {
        version: '1.0.0',
        data: [result],
      });
    });

    it('should add new item to beginning of list', async () => {
      const existingItem = makeItem({ id: 'sched-1' });
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [existingItem] });
      await service.initialize();

      const input: Omit<ScheduledDownload, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'> = {
        sourceUrl: 'https://example.com/video2',
        date: '2024-01-02',
        time: '09:00',
        repeat: 'daily',
        status: 'scheduled',
        nextRunAt: '2024-01-02T09:00:00.000Z',
      };

      const result = await service.create(input);

      const items = await service.getAll();
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual(result);
      expect(items[1]).toEqual(existingItem);
    });

    it('should persist exactly once per create call', async () => {
      await service.initialize();
      mockWriteJsonFile.mockClear();

      await service.create({
        sourceUrl: 'https://example.com/video1',
        date: '2024-01-01',
        time: '14:30',
        repeat: 'once',
        status: 'scheduled',
        nextRunAt: '2024-01-01T14:30:00.000Z',
      });

      expect(mockWriteJsonFile).toHaveBeenCalledTimes(1);
    });

    it('should trigger due scheduled downloads automatically', async () => {
      const dueAt = new Date(Date.now() - 60_000).toISOString();
      const item = makeItem({ id: 'sched-trigger', nextRunAt: dueAt, repeat: 'once', status: 'scheduled' });
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [item] });
      await service.initialize();

      const result = await service.tick(Date.now());

      expect(result.triggered).toHaveLength(1);
      expect(result.triggered[0].schedule.status).toBe('triggered');
      expect(result.items[0].status).toBe('triggered');
      expect(result.items[0].triggerCount).toBe(1);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update existing item and persist to file', async () => {
      const existingItem = makeItem({ status: 'scheduled', time: '14:30' });
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [existingItem] });
      await service.initialize();

      const updatedInput: ScheduledDownload = { ...existingItem, time: '15:00', status: 'scheduled' };
      const result = await service.update(updatedInput);

      expect(result.time).toBe('15:00');
      expect(result.updatedAt).not.toBe(existingItem.updatedAt);

      expect(mockWriteJsonFile).toHaveBeenCalledWith(
        'scheduler.json',
        expect.objectContaining({ version: '1.0.0' })
      );
    });

    it('should persist exactly once per update call', async () => {
      const existingItem = makeItem();
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [existingItem] });
      await service.initialize();
      mockWriteJsonFile.mockClear();

      await service.update({ ...existingItem, time: '15:00' });

      expect(mockWriteJsonFile).toHaveBeenCalledTimes(1);
    });
  });

  // ─── cancel ───────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should cancel item and persist to file', async () => {
      const existingItem = makeItem({ status: 'scheduled' });
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [existingItem] });
      await service.initialize();

      const result = await service.cancel('sched-1');

      expect(result.status).toBe('canceled');
      expect(result.updatedAt).not.toBe(existingItem.updatedAt);
      expect(mockWriteJsonFile).toHaveBeenCalledWith(
        'scheduler.json',
        expect.objectContaining({ version: '1.0.0' })
      );
    });

    it('should throw if item not found', async () => {
      await service.initialize();
      await expect(service.cancel('nonexistent')).rejects.toThrow(
        'Scheduled item not found: nonexistent'
      );
    });

    it('should persist exactly once per cancel call', async () => {
      const existingItem = makeItem();
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [existingItem] });
      await service.initialize();
      mockWriteJsonFile.mockClear();

      await service.cancel('sched-1');

      expect(mockWriteJsonFile).toHaveBeenCalledTimes(1);
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should remove item by id and persist to file', async () => {
      const item1 = makeItem({ id: 'sched-1' });
      const item2 = makeItem({ id: 'sched-2', time: '09:00', repeat: 'daily' });
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [item1, item2] });
      await service.initialize();

      const removedId = await service.remove('sched-1');

      expect(removedId).toBe('sched-1');
      expect(mockWriteJsonFile).toHaveBeenCalledWith('scheduler.json', {
        version: '1.0.0',
        data: [item2],
      });

      const items = await service.getAll();
      expect(items).toEqual([item2]);
    });

    it('should return id even if item does not exist (no-op remove)', async () => {
      await service.initialize();
      const removedId = await service.remove('nonexistent');
      expect(removedId).toBe('nonexistent');
    });

    it('should persist exactly once per remove call', async () => {
      const item = makeItem();
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [item] });
      await service.initialize();
      mockWriteJsonFile.mockClear();

      await service.remove('sched-1');

      expect(mockWriteJsonFile).toHaveBeenCalledTimes(1);
      expect(mockWriteJsonFile).toHaveBeenCalledWith('scheduler.json', {
        version: '1.0.0',
        data: [],
      });
    });
  });
});
