import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getStoragePath,
  readJsonFile,
  writeJsonFile,
  ensureStorageDirectory,
  setFileSystemOperations,
  setAppPathProvider,
  resetToRealImplementations,
  type FileSystemOperations,
  type AppPathProvider,
} from './fileStorage';

describe('fileStorage', () => {
  let mockFs: FileSystemOperations;
  let mockApp: AppPathProvider;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockFs = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };

    mockApp = {
      getUserDataPath: vi.fn(() => '/mock/appdata'),
    };

    setFileSystemOperations(mockFs);
    setAppPathProvider(mockApp);
  });

  afterEach(() => {
    resetToRealImplementations();
    vi.restoreAllMocks();
  });

  describe('getStoragePath', () => {
    it('should return correct path using app.getPath(userData)', () => {
      const path = getStoragePath('test.json');
      expect(path).toContain('remon-download');
      expect(path).toContain('test.json');
    });

    it('should handle different filenames', () => {
      const historyPath = getStoragePath('history.json');
      const settingsPath = getStoragePath('settings.json');

      expect(historyPath).toContain('history.json');
      expect(settingsPath).toContain('settings.json');
      expect(historyPath).not.toBe(settingsPath);
    });
  });

  describe('ensureStorageDirectory', () => {
    it('should create directory with recursive option', async () => {
      await ensureStorageDirectory();

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('remon-download'),
        { recursive: true }
      );
    });

    it('should not throw if directory already exists', async () => {
      mockFs.mkdir = vi.fn().mockResolvedValue(undefined);

      await expect(ensureStorageDirectory()).resolves.not.toThrow();
    });

    it('should propagate mkdir errors', async () => {
      const error = new Error('Permission denied');
      mockFs.mkdir = vi.fn().mockRejectedValue(error);

      await expect(ensureStorageDirectory()).rejects.toThrow('Permission denied');
    });
  });

  describe('readJsonFile', () => {
    it('should read and parse valid JSON file', async () => {
      const mockData = { version: '1.0.0', data: [{ id: '1', name: 'test' }] };
      mockFs.readFile = vi.fn().mockResolvedValue(JSON.stringify(mockData));

      const result = await readJsonFile('test.json', { version: '1.0.0', data: [] });

      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('test.json'),
        'utf-8'
      );
      expect(result).toEqual(mockData);
    });

    it('should return fallback if file does not exist (ENOENT)', async () => {
      const error: NodeJS.ErrnoException = new Error('File not found');
      error.code = 'ENOENT';
      mockFs.readFile = vi.fn().mockRejectedValue(error);

      const fallback = { version: '1.0.0', data: [] };
      const result = await readJsonFile('missing.json', fallback);

      expect(result).toEqual(fallback);
    });

    it('should return fallback if JSON is invalid', async () => {
      mockFs.readFile = vi.fn().mockResolvedValue('{ invalid json');

      const fallback = { version: '1.0.0', data: [] };
      const result = await readJsonFile('corrupt.json', fallback);

      expect(result).toEqual(fallback);
    });

    it('should throw on read errors other than ENOENT', async () => {
      const error: NodeJS.ErrnoException = new Error('Permission denied');
      error.code = 'EACCES';
      mockFs.readFile = vi.fn().mockRejectedValue(error);

      const fallback = { version: '1.0.0', data: [] };

      await expect(readJsonFile('test.json', fallback)).rejects.toThrow('Permission denied');
    });

    it('should handle empty file with fallback', async () => {
      mockFs.readFile = vi.fn().mockResolvedValue('');

      const fallback = { version: '1.0.0', data: [] };
      const result = await readJsonFile('empty.json', fallback);

      expect(result).toEqual(fallback);
    });

    it('should parse array data correctly', async () => {
      const mockData = [{ id: '1' }, { id: '2' }];
      mockFs.readFile = vi.fn().mockResolvedValue(JSON.stringify(mockData));

      const result = await readJsonFile('array.json', []);

      expect(result).toEqual(mockData);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('writeJsonFile', () => {
    it('should ensure directory exists before writing', async () => {
      const data = { version: '1.0.0', data: [{ id: '1' }] };

      await writeJsonFile('test.json', data);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('remon-download'),
        { recursive: true }
      );
    });

    it('should write JSON data with pretty formatting', async () => {
      const data = { version: '1.0.0', data: [{ id: '1', name: 'test' }] };

      await writeJsonFile('test.json', data);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test.json'),
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    });

    it('should handle empty objects', async () => {
      const data = {};

      await writeJsonFile('empty.json', data);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    });

    it('should handle arrays', async () => {
      const data = [{ id: '1' }, { id: '2' }];

      await writeJsonFile('array.json', data);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    });

    it('should propagate write errors', async () => {
      const error = new Error('Disk full');
      mockFs.writeFile = vi.fn().mockRejectedValue(error);

      const data = { version: '1.0.0', data: [] };

      await expect(writeJsonFile('test.json', data)).rejects.toThrow('Disk full');
    });

    it('should propagate directory creation errors', async () => {
      const error = new Error('Permission denied');
      mockFs.mkdir = vi.fn().mockRejectedValue(error);

      const data = { version: '1.0.0', data: [] };

      await expect(writeJsonFile('test.json', data)).rejects.toThrow('Permission denied');
    });
  });

  describe('integration scenarios', () => {
    it('should write and read back the same data', async () => {
      const originalData = {
        version: '1.0.0',
        data: [
          { id: '1', title: 'Test 1' },
          { id: '2', title: 'Test 2' },
        ],
      };

      // Simulate write
      let writtenData: string = '';
      mockFs.writeFile = vi.fn().mockImplementation(async (path, data) => {
        writtenData = data as string;
      });

      await writeJsonFile('test.json', originalData);

      // Simulate read
      mockFs.readFile = vi.fn().mockResolvedValue(writtenData);

      const readData = await readJsonFile('test.json', { version: '1.0.0', data: [] });

      expect(readData).toEqual(originalData);
    });

    it('should handle multiple files independently', async () => {
      const historyData = { version: '1.0.0', data: [{ id: '1' }] };
      const favoritesData = { version: '1.0.0', data: [{ id: '2' }] };

      await writeJsonFile('history.json', historyData);
      await writeJsonFile('favorites.json', favoritesData);

      expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('history.json'),
        expect.any(String),
        'utf-8'
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('favorites.json'),
        expect.any(String),
        'utf-8'
      );
    });
  });
});
