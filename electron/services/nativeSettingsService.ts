/**
 * NativeSettingsService — Main Process settings boundary with persistent storage.
 *
 * Phase 3.1: Persistent storage using fs-based JSON files.
 * Settings are stored in %APPDATA%/remon-download/settings.json
 *
 * Implements the same lazy-initialization pattern as NativeFavoritesService:
 * - initializationPromise guard (idempotent)
 * - merge loaded settings with DEFAULT_SETTINGS (handles missing keys gracefully)
 * - isSettingsFileFormat type guard
 * - persist() after update/reset
 *
 * The interface is async (unlike the Renderer-facing SettingsService which is sync)
 * because the Main Process uses async I/O.
 */
import { DEFAULT_SETTINGS } from '../../src/constants/settings';
import type { AppSettings } from '../../src/types/settings';
import { readJsonFile, writeJsonFile } from '../utils/fileStorage';

interface SettingsFileFormat {
  version: string;
  data: Partial<AppSettings>;
}

function isSettingsFileFormat(value: unknown): value is SettingsFileFormat {
  return (
    !!value &&
    typeof value === 'object' &&
    'data' in value &&
    !!(value as { data?: unknown }).data &&
    typeof (value as { data: unknown }).data === 'object'
  );
}

/**
 * Merge loaded settings with DEFAULT_SETTINGS.
 * Any keys missing from disk (e.g., new keys added in newer versions)
 * are filled in from defaults, preventing runtime errors.
 */
function mergeWithDefaults(loaded: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_SETTINGS, ...loaded };
}

export class NativeSettingsService {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private readonly SETTINGS_FILE = 'settings.json';
  private readonly FILE_VERSION = '1.0.0';
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize service by loading settings from disk.
   * Idempotent — multiple calls return the same promise.
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      const fileData = await readJsonFile<unknown>(
        this.SETTINGS_FILE,
        {
          version: this.FILE_VERSION,
          data: DEFAULT_SETTINGS,
        }
      );

      if (isSettingsFileFormat(fileData)) {
        // Merge with defaults to handle missing/new keys
        this.settings = mergeWithDefaults(fileData.data);
        return;
      }

      // Corrupted / legacy format — fall back to defaults
      this.settings = { ...DEFAULT_SETTINGS };
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
   * Persist current settings to disk.
   */
  private async persist(): Promise<void> {
    await writeJsonFile<SettingsFileFormat>(this.SETTINGS_FILE, {
      version: this.FILE_VERSION,
      data: this.settings,
    });
  }

  async get(): Promise<AppSettings> {
    await this.ensureInitialized();
    return { ...this.settings };
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    await this.ensureInitialized();
    this.settings = { ...this.settings, ...patch };
    await this.persist();
    return { ...this.settings };
  }

  async reset(): Promise<AppSettings> {
    await this.ensureInitialized();
    this.settings = { ...DEFAULT_SETTINGS };
    await this.persist();
    return { ...this.settings };
  }
}
