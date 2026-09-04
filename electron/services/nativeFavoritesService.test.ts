import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeFavoritesService } from './nativeFavoritesService';
import type { FavoriteItem } from '../../src/types/download';
import * as fileStorage from '../utils/fileStorage';

// Mock fileStorage module
vi.mock('../utils/fileStorage', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
}));

describe('NativeFavoritesService', () => {
  let service: NativeFavoritesService;
  let mockReadJsonFile: ReturnType<typeof vi.fn>;
  let mockWriteJsonFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReadJsonFile = vi.mocked(fileStorage.readJsonFile);
    mockWriteJsonFile = vi.mocked(fileStorage.writeJsonFile);

    // Default: empty favorites file
    mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [] });
    mockWriteJsonFile.mockResolvedValue(undefined);

    service = new NativeFavoritesService();
  });

  describe('initialization', () => {
    it('should load favorites from file on construction', async () => {
      const mockData: FavoriteItem[] = [
        {
          id: '1',
          sourceUrl: 'https://example.com/video1',
          title: 'Video 1',
          thumbnail: 'https://example.com/thumb1.jpg',
          channel: 'Channel 1',
          dateAdded: '2024-01-01T00:00:00.000Z',
        },
        {
          id: '2',
          sourceUrl: 'https://example.com/video2',
          title: 'Video 2',
          thumbnail: 'https://example.com/thumb2.jpg',
          channel: 'Channel 2',
          dateAdded: '2024-01-02T00:00:00.000Z',
        },
      ];

      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: mockData });

      const newService = new NativeFavoritesService();
      await newService.initialize();

      expect(mockReadJsonFile).toHaveBeenCalledWith('favorites.json', {
        version: '1.0.0',
        data: [],
      });

      const items = await newService.getAll();
      expect(items).toEqual(mockData);
    });

    it('should start with empty array if file does not exist', async () => {
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [] });

      const newService = new NativeFavoritesService();
      await newService.initialize();

      const items = await newService.getAll();
      expect(items).toEqual([]);
    });

    it('should ignore legacy array-shaped favorites file and fall back to empty state', async () => {
      mockReadJsonFile.mockResolvedValue([
        {
          id: 'legacy-1',
          sourceUrl: 'https://example.com/legacy',
          title: 'Legacy Favorite',
          thumbnail: 'https://example.com/legacy.jpg',
          channel: 'Legacy Channel',
          dateAdded: '2024-01-01T00:00:00.000Z',
        },
      ] as unknown as { version: string; data: FavoriteItem[] });

      const newService = new NativeFavoritesService();
      await expect(newService.initialize()).resolves.toBeUndefined();

      const items = await newService.getAll();
      expect(items).toEqual([]);
    });

    it('should normalize invalid dateAdded values from disk before rendering', async () => {
      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: [
          {
            id: 'broken-date',
            sourceUrl: 'https://example.com/broken',
            title: 'Broken Favorite',
            thumbnail: 'https://example.com/broken.jpg',
            channel: 'Broken Channel',
            dateAdded: 'not-a-valid-date',
          },
        ],
      });

      const newService = new NativeFavoritesService();
      await newService.initialize();

      const [favorite] = await newService.getAll();
      expect(favorite.dateAdded).toBeTypeOf('string');
      expect(Number.isNaN(new Date(favorite.dateAdded).getTime())).toBe(false);
    });

    it('should handle file read errors gracefully', async () => {
      mockReadJsonFile.mockRejectedValue(new Error('Permission denied'));

      const newService = new NativeFavoritesService();

      await expect(newService.initialize()).rejects.toThrow('Permission denied');
    });
  });

  describe('getAll', () => {
    it('should return all favorite items', async () => {
      const mockData: FavoriteItem[] = [
        {
          id: '1',
          sourceUrl: 'https://example.com/video1',
          title: 'Video 1',
          thumbnail: 'https://example.com/thumb1.jpg',
          channel: 'Channel 1',
          dateAdded: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: mockData });
      await service.initialize();

      const items = await service.getAll();

      expect(items).toEqual(mockData);
    });

    it('should return a copy of items array', async () => {
      const mockData: FavoriteItem[] = [
        {
          id: '1',
          sourceUrl: 'https://example.com/video1',
          title: 'Video 1',
          thumbnail: 'https://example.com/thumb1.jpg',
          channel: 'Channel 1',
          dateAdded: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: mockData });
      await service.initialize();

      const items1 = await service.getAll();
      const items2 = await service.getAll();

      expect(items1).toEqual(items2);
      expect(items1).not.toBe(items2); // Different array instances
    });
  });

  describe('add', () => {
    it('should add new item to favorites and persist to file', async () => {
      await service.initialize();

      const newItem: FavoriteItem = {
        id: '1',
        sourceUrl: 'https://example.com/video1',
        title: 'Video 1',
        thumbnail: 'https://example.com/thumb1.jpg',
        channel: 'Channel 1',
        dateAdded: '2024-01-01T00:00:00.000Z',
      };

      const result = await service.add(newItem);

      expect(result).toEqual(newItem);
      expect(mockWriteJsonFile).toHaveBeenCalledWith('favorites.json', {
        version: '1.0.0',
        data: [newItem],
      });

      const items = await service.getAll();
      expect(items).toEqual([newItem]);
    });

    it('should add new item to beginning of list', async () => {
      const existingItem: FavoriteItem = {
        id: '1',
        sourceUrl: 'https://example.com/video1',
        title: 'Video 1',
        thumbnail: 'https://example.com/thumb1.jpg',
        channel: 'Channel 1',
        dateAdded: '2024-01-01T00:00:00.000Z',
      };

      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: [existingItem],
      });
      await service.initialize();

      const newItem: FavoriteItem = {
        id: '2',
        sourceUrl: 'https://example.com/video2',
        title: 'Video 2',
        thumbnail: 'https://example.com/thumb2.jpg',
        channel: 'Channel 2',
        dateAdded: '2024-01-02T00:00:00.000Z',
      };

      await service.add(newItem);

      const items = await service.getAll();
      expect(items).toEqual([newItem, existingItem]);
    });

    it('should replace existing item with same id', async () => {
      const existingItem: FavoriteItem = {
        id: '1',
        sourceUrl: 'https://example.com/video1',
        title: 'Video 1',
        thumbnail: 'https://example.com/thumb1.jpg',
        channel: 'Channel 1',
        dateAdded: '2024-01-01T00:00:00.000Z',
      };

      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: [existingItem],
      });
      await service.initialize();

      const updatedItem: FavoriteItem = {
        ...existingItem,
        title: 'Video 1 Updated',
      };

      await service.add(updatedItem);

      const items = await service.getAll();
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(updatedItem);
    });

    it('should persist to file after adding', async () => {
      await service.initialize();

      // Clear mock call history after initialize
      mockWriteJsonFile.mockClear();

      const newItem: FavoriteItem = {
        id: '1',
        sourceUrl: 'https://example.com/video1',
        title: 'Video 1',
        thumbnail: 'https://example.com/thumb1.jpg',
        channel: 'Channel 1',
        dateAdded: '2024-01-01T00:00:00.000Z',
      };

      await service.add(newItem);

      expect(mockWriteJsonFile).toHaveBeenCalledTimes(1);
      expect(mockWriteJsonFile).toHaveBeenCalledWith('favorites.json', {
        version: '1.0.0',
        data: [newItem],
      });
    });
  });

  describe('remove', () => {
    it('should remove item by id and persist to file', async () => {
      const item1: FavoriteItem = {
        id: '1',
        sourceUrl: 'https://example.com/video1',
        title: 'Video 1',
        thumbnail: 'https://example.com/thumb1.jpg',
        channel: 'Channel 1',
        dateAdded: '2024-01-01T00:00:00.000Z',
      };

      const item2: FavoriteItem = {
        id: '2',
        sourceUrl: 'https://example.com/video2',
        title: 'Video 2',
        thumbnail: 'https://example.com/thumb2.jpg',
        channel: 'Channel 2',
        dateAdded: '2024-01-02T00:00:00.000Z',
      };

      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: [item1, item2],
      });
      await service.initialize();

      const removedId = await service.remove('1');

      expect(removedId).toBe('1');
      expect(mockWriteJsonFile).toHaveBeenCalledWith('favorites.json', {
        version: '1.0.0',
        data: [item2],
      });

      const items = await service.getAll();
      expect(items).toEqual([item2]);
    });

    it('should return id even if item does not exist', async () => {
      await service.initialize();

      const removedId = await service.remove('nonexistent');

      expect(removedId).toBe('nonexistent');
    });

    it('should persist to file after removing', async () => {
      const item: FavoriteItem = {
        id: '1',
        sourceUrl: 'https://example.com/video1',
        title: 'Video 1',
        thumbnail: 'https://example.com/thumb1.jpg',
        channel: 'Channel 1',
        dateAdded: '2024-01-01T00:00:00.000Z',
      };

      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: [item],
      });
      await service.initialize();

      // Clear mock call history after initialize
      mockWriteJsonFile.mockClear();

      await service.remove('1');

      expect(mockWriteJsonFile).toHaveBeenCalledTimes(1);
      expect(mockWriteJsonFile).toHaveBeenCalledWith('favorites.json', {
        version: '1.0.0',
        data: [],
      });
    });
  });

  describe('persistence', () => {
    it('should serialize and deserialize dates correctly', async () => {
      const item: FavoriteItem = {
        id: '1',
        sourceUrl: 'https://example.com/video1',
        title: 'Video 1',
        thumbnail: 'https://example.com/thumb1.jpg',
        channel: 'Test Channel',
        dateAdded: '2024-01-01T12:00:00.000Z',
      };

      await service.initialize();
      await service.add(item);

      // Verify writeJsonFile was called
      expect(mockWriteJsonFile).toHaveBeenCalled();

      // Simulate reading back
      const serializedData = {
        version: '1.0.0',
        data: [item],
      };

      mockReadJsonFile.mockResolvedValue(serializedData);

      const newService = new NativeFavoritesService();
      await newService.initialize();

      const items = await newService.getAll();
      expect(items[0].dateAdded).toBe('2024-01-01T12:00:00.000Z');
    });
  });
});
