import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeHistoryService } from './nativeHistoryService';
import type { HistoryItem } from '../../src/types/download';
import * as fileStorage from '../utils/fileStorage';

// Mock fileStorage module
vi.mock('../utils/fileStorage', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
}));

describe('NativeHistoryService', () => {
  let service: NativeHistoryService;
  let mockReadJsonFile: ReturnType<typeof vi.fn>;
  let mockWriteJsonFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReadJsonFile = vi.mocked(fileStorage.readJsonFile);
    mockWriteJsonFile = vi.mocked(fileStorage.writeJsonFile);

    // Default: empty history file
    mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [] });
    mockWriteJsonFile.mockResolvedValue(undefined);

    service = new NativeHistoryService();
  });

  describe('initialization', () => {
    it('should load history from file on construction', async () => {
      const mockData: HistoryItem[] = [
        {
          id: '1',
          sourceDownloadId: 'dl-1',
          metadataId: 'meta-1',
          thumbnail: 'https://example.com/thumb1.jpg',
          title: 'Video 1',
          sourceUrl: 'https://example.com/video1',
          date: '2024-01-01T12:00:00.000Z',
          quality: '720p',
          format: 'mp4',
          fileSize: 1024000,
          status: 'completed',
        },
        {
          id: '2',
          sourceDownloadId: 'dl-2',
          metadataId: 'meta-2',
          thumbnail: 'https://example.com/thumb2.jpg',
          title: 'Video 2',
          sourceUrl: 'https://example.com/video2',
          date: '2024-01-02T12:00:00.000Z',
          quality: '1080p',
          format: 'webm',
          fileSize: 2048000,
          status: 'failed',
          errorMessage: 'Network error',
        },
      ];

      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: mockData });

      const newService = new NativeHistoryService();
      await newService.initialize();

      expect(mockReadJsonFile).toHaveBeenCalledWith('history.json', {
        version: '1.0.0',
        data: [],
      });

      const items = await newService.getAll();
      expect(items).toEqual(mockData);
    });

    it('should start with empty array if file does not exist', async () => {
      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: [] });

      const newService = new NativeHistoryService();
      await newService.initialize();

      const items = await newService.getAll();
      expect(items).toEqual([]);
    });

    it('should handle file read errors gracefully', async () => {
      mockReadJsonFile.mockRejectedValue(new Error('Permission denied'));

      const newService = new NativeHistoryService();

      await expect(newService.initialize()).rejects.toThrow('Permission denied');
    });

    it('should handle legacy JSON files by mapping property fallbacks', async () => {
      // Legacy item has 'url' instead of 'sourceUrl', and 'size' instead of 'fileSize'
      const legacyData = [
        {
          id: 'legacy-1',
          url: 'https://example.com/legacy',
          title: 'Legacy Title',
          size: 5000,
          status: 'completed',
        },
      ];

      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: legacyData });

      const newService = new NativeHistoryService();
      await newService.initialize();

      const items = await newService.getAll();
      expect(items).toHaveLength(1);
      expect(items[0].sourceUrl).toBe('https://example.com/legacy');
      expect(items[0].fileSize).toBe(5000);
    });
  });

  describe('getAll', () => {
    it('should return all history items', async () => {
      const mockData: HistoryItem[] = [
        {
          id: '1',
          sourceDownloadId: 'dl-1',
          metadataId: 'meta-1',
          thumbnail: 'https://example.com/thumb1.jpg',
          title: 'Video 1',
          sourceUrl: 'https://example.com/video1',
          date: '2024-01-01T12:00:00.000Z',
          quality: '720p',
          format: 'mp4',
          fileSize: 1024000,
          status: 'completed',
        },
      ];

      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: mockData });
      await service.initialize();

      const items = await service.getAll();

      expect(items).toEqual(mockData);
    });

    it('should return a copy of items array', async () => {
      const mockData: HistoryItem[] = [
        {
          id: '1',
          sourceDownloadId: 'dl-1',
          metadataId: 'meta-1',
          thumbnail: 'https://example.com/thumb1.jpg',
          title: 'Video 1',
          sourceUrl: 'https://example.com/video1',
          date: '2024-01-01T12:00:00.000Z',
          quality: '720p',
          format: 'mp4',
          fileSize: 1024000,
          status: 'completed',
        },
      ];

      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: mockData });
      await service.initialize();

      const items1 = await service.getAll();
      const items2 = await service.getAll();

      expect(items1).toEqual(items2);
      expect(items1).not.toBe(items2);
    });
  });

  describe('add', () => {
    it('should add new item to history and persist to file', async () => {
      await service.initialize();

      const newItem: HistoryItem = {
        id: '1',
        sourceDownloadId: 'dl-1',
        metadataId: 'meta-1',
        thumbnail: 'https://example.com/thumb1.jpg',
        title: 'Video 1',
        sourceUrl: 'https://example.com/video1',
        date: '2024-01-01T12:00:00.000Z',
        quality: '720p',
        format: 'mp4',
        fileSize: 1024000,
        status: 'completed',
      };

      const result = await service.add(newItem);

      expect(result).toEqual(newItem);
      expect(mockWriteJsonFile).toHaveBeenCalledWith('history.json', {
        version: '1.0.0',
        data: [newItem],
      });

      const items = await service.getAll();
      expect(items).toEqual([newItem]);
    });

    it('should replace existing item with same id', async () => {
      const existingItem: HistoryItem = {
        id: '1',
        sourceDownloadId: 'dl-1',
        metadataId: 'meta-1',
        thumbnail: 'https://example.com/thumb1.jpg',
        title: 'Video 1',
        sourceUrl: 'https://example.com/video1',
        date: '2024-01-01T12:00:00.000Z',
        quality: '720p',
        format: 'mp4',
        fileSize: 1024000,
        status: 'completed',
      };

      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: [existingItem],
      });
      await service.initialize();

      const updatedItem: HistoryItem = {
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

      mockWriteJsonFile.mockClear();

      const newItem: HistoryItem = {
        id: '1',
        sourceDownloadId: 'dl-1',
        metadataId: 'meta-1',
        thumbnail: 'https://example.com/thumb1.jpg',
        title: 'Video 1',
        sourceUrl: 'https://example.com/video1',
        date: '2024-01-01T12:00:00.000Z',
        quality: '720p',
        format: 'mp4',
        fileSize: 1024000,
        status: 'completed',
      };

      await service.add(newItem);

      expect(mockWriteJsonFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('should remove item by id and persist to file', async () => {
      const item1: HistoryItem = {
        id: '1',
        sourceDownloadId: 'dl-1',
        metadataId: 'meta-1',
        thumbnail: 'https://example.com/thumb1.jpg',
        title: 'Video 1',
        sourceUrl: 'https://example.com/video1',
        date: '2024-01-01T12:00:00.000Z',
        quality: '720p',
        format: 'mp4',
        fileSize: 1024000,
        status: 'completed',
      };

      const item2: HistoryItem = {
        id: '2',
        sourceDownloadId: 'dl-2',
        metadataId: 'meta-2',
        thumbnail: 'https://example.com/thumb2.jpg',
        title: 'Video 2',
        sourceUrl: 'https://example.com/video2',
        date: '2024-01-02T12:00:00.000Z',
        quality: '1080p',
        format: 'webm',
        fileSize: 2048000,
        status: 'failed',
      };

      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: [item1, item2],
      });
      await service.initialize();

      const removedId = await service.remove('1');

      expect(removedId).toBe('1');
      expect(mockWriteJsonFile).toHaveBeenCalledWith('history.json', {
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
  });

  describe('clear', () => {
    it('should clear all items and persist to file', async () => {
      const item1: HistoryItem = {
        id: '1',
        sourceDownloadId: 'dl-1',
        metadataId: 'meta-1',
        thumbnail: 'https://example.com/thumb1.jpg',
        title: 'Video 1',
        sourceUrl: 'https://example.com/video1',
        date: '2024-01-01T12:00:00.000Z',
        quality: '720p',
        format: 'mp4',
        fileSize: 1024000,
        status: 'completed',
      };

      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: [item1],
      });
      await service.initialize();

      await service.clear();

      expect(mockWriteJsonFile).toHaveBeenCalledWith('history.json', {
        version: '1.0.0',
        data: [],
      });

      const items = await service.getAll();
      expect(items).toEqual([]);
    });
  });
});
