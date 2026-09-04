import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeSettingsService } from './nativeSettingsService';
import { DEFAULT_SETTINGS } from '../../src/constants/settings';
import type { AppSettings } from '../../src/types/settings';
import * as fileStorage from '../utils/fileStorage';

// Mock fileStorage module
vi.mock('../utils/fileStorage', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
}));

describe('NativeSettingsService', () => {
  let service: NativeSettingsService;
  let mockReadJsonFile: ReturnType<typeof vi.fn>;
  let mockWriteJsonFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReadJsonFile = vi.mocked(fileStorage.readJsonFile);
    mockWriteJsonFile = vi.mocked(fileStorage.writeJsonFile);

    // Default: return DEFAULT_SETTINGS wrapped in file format
    mockReadJsonFile.mockResolvedValue({
      version: '1.0.0',
      data: DEFAULT_SETTINGS,
    });
    mockWriteJsonFile.mockResolvedValue(undefined);

    service = new NativeSettingsService();
  });

  // ─── initialization ───────────────────────────────────────────────────────

  describe('initialization', () => {
    it('should load settings from file on initialize()', async () => {
      const customSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        downloadFolder: 'C:\\Custom\\Downloads',
        defaultQuality: '1080p',
      };

      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: customSettings,
      });

      const newService = new NativeSettingsService();
      await newService.initialize();

      expect(mockReadJsonFile).toHaveBeenCalledWith('settings.json', {
        version: '1.0.0',
        data: DEFAULT_SETTINGS,
      });

      const settings = await newService.get();
      expect(settings.downloadFolder).toBe('C:\\Custom\\Downloads');
      expect(settings.defaultQuality).toBe('1080p');
    });

    it('should start with DEFAULT_SETTINGS if file does not exist', async () => {
      mockReadJsonFile.mockResolvedValue({
        version: '1.0.0',
        data: DEFAULT_SETTINGS,
      });

      const newService = new NativeSettingsService();
      await newService.initialize();

      const settings = await newService.get();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should merge missing keys from DEFAULT_SETTINGS (handles new settings added in upgrades)', async () => {
      // Simulate old settings file missing new keys
      const partialSettings: Partial<AppSettings> = {
        downloadFolder: 'C:\\Old\\Downloads',
        language: 'ar',
      };

      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: partialSettings });

      const newService = new NativeSettingsService();
      await newService.initialize();

      const settings = await newService.get();
      // Known key from file is preserved
      expect(settings.downloadFolder).toBe('C:\\Old\\Downloads');
      expect(settings.language).toBe('ar');
      // New/missing keys filled from defaults
      expect(settings.concurrentDownloads).toBe(DEFAULT_SETTINGS.concurrentDownloads);
      expect(settings.defaultQuality).toBe(DEFAULT_SETTINGS.defaultQuality);
    });

    it('should fall back to DEFAULT_SETTINGS for corrupted/non-object JSON', async () => {
      // Non-{ version, data } structure
      mockReadJsonFile.mockResolvedValue('corrupted string' as unknown as { version: string; data: AppSettings });

      const newService = new NativeSettingsService();
      await newService.initialize();

      const settings = await newService.get();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should handle file read errors by propagating', async () => {
      mockReadJsonFile.mockRejectedValue(new Error('Permission denied'));

      const newService = new NativeSettingsService();
      await expect(newService.initialize()).rejects.toThrow('Permission denied');
    });

    it('should be idempotent — calling initialize() twice reads file only once', async () => {
      const newService = new NativeSettingsService();
      mockReadJsonFile.mockClear();
      await newService.initialize();
      await newService.initialize();

      expect(mockReadJsonFile).toHaveBeenCalledTimes(1);
    });

    it('should lazy-initialize on first get() without explicit initialize()', async () => {
      const newService = new NativeSettingsService();
      mockReadJsonFile.mockClear();
      const settings = await newService.get();
      expect(settings).toEqual(DEFAULT_SETTINGS);
      expect(mockReadJsonFile).toHaveBeenCalledTimes(1);
    });
  });

  // ─── get ─────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('should return current settings', async () => {
      const customSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        downloadFolder: 'C:\\Custom\\Downloads',
      };

      mockReadJsonFile.mockResolvedValue({ version: '1.0.0', data: customSettings });
      await service.initialize();

      const settings = await service.get();
      expect(settings.downloadFolder).toBe('C:\\Custom\\Downloads');
    });

    it('should return a copy (not the same object reference)', async () => {
      await service.initialize();

      const s1 = await service.get();
      const s2 = await service.get();

      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should apply a partial patch and persist', async () => {
      await service.initialize();

      const result = await service.update({ downloadFolder: 'C:\\Custom\\Downloads', defaultQuality: '1080p' });

      expect(result.downloadFolder).toBe('C:\\Custom\\Downloads');
      expect(result.defaultQuality).toBe('1080p');
      // Un-patched keys remain unchanged
      expect(result.language).toBe(DEFAULT_SETTINGS.language);

      expect(mockWriteJsonFile).toHaveBeenCalledWith(
        'settings.json',
        expect.objectContaining({
          version: '1.0.0',
          data: result,
        })
      );
    });

    it('should accumulate multiple patches', async () => {
      await service.initialize();

      await service.update({ downloadFolder: 'C:\\Downloads1' });
      const result = await service.update({ defaultQuality: '1080p' });

      expect(result.downloadFolder).toBe('C:\\Downloads1');
      expect(result.defaultQuality).toBe('1080p');
    });

    it('should persist exactly once per update call', async () => {
      await service.initialize();
      mockWriteJsonFile.mockClear();

      await service.update({ downloadFolder: 'C:\\Custom\\Downloads' });

      expect(mockWriteJsonFile).toHaveBeenCalledTimes(1);
    });
  });

  // ─── reset ────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('should reset to DEFAULT_SETTINGS and persist', async () => {
      await service.initialize();

      await service.update({ downloadFolder: 'C:\\Custom\\Downloads', defaultQuality: '1080p' });

      const result = await service.reset();

      expect(result).toEqual(DEFAULT_SETTINGS);
      expect(mockWriteJsonFile).toHaveBeenCalledWith('settings.json', {
        version: '1.0.0',
        data: DEFAULT_SETTINGS,
      });
    });

    it('should persist exactly once per reset call', async () => {
      await service.initialize();
      await service.update({ downloadFolder: 'C:\\Custom\\Downloads' });
      mockWriteJsonFile.mockClear();

      await service.reset();

      expect(mockWriteJsonFile).toHaveBeenCalledTimes(1);
    });

    it('should return DEFAULT_SETTINGS from subsequent get() after reset', async () => {
      await service.initialize();
      await service.update({ downloadFolder: 'C:\\Custom\\Downloads' });
      await service.reset();

      const settings = await service.get();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });
});
