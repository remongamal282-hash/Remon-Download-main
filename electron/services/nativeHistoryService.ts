/**
 * NativeHistoryService — Main Process history boundary with persistent storage.
 *
 * Phase 3.1: Persistent storage using fs-based JSON files.
 * History is stored in %APPDATA%/remon-download/history.json
 */
import type { HistoryItem } from '../../src/types/download';
import { readJsonFile, writeJsonFile } from '../utils/fileStorage';

interface HistoryFileFormat {
  version: string;
  data: HistoryItem[];
}

function isHistoryFileFormat(value: unknown): value is HistoryFileFormat {
  return !!value && typeof value === 'object' && 'data' in value && Array.isArray((value as { data?: unknown }).data);
}

function normalizeHistoryItem(item: Partial<HistoryItem> | null | undefined): HistoryItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const dateValue = typeof item.date === 'string' ? item.date : new Date().toISOString();

  return {
    id: String(item.id ?? crypto.randomUUID()),
    sourceDownloadId: String(item.sourceDownloadId ?? ''),
    metadataId: String(item.metadataId ?? ''),
    thumbnail: String(item.thumbnail ?? ''),
    title: String(item.title ?? 'Untitled Download'),
    sourceUrl: String(item.sourceUrl ?? (item as Record<string, unknown>)['url'] ?? ''), // Fallback to legacy 'url' if exists
    date: dateValue,
    quality: String(item.quality ?? 'Unknown'),
    format: String(item.format ?? 'Unknown'),
    fileSize: typeof item.fileSize === 'number' ? item.fileSize : typeof (item as any).size === 'number' ? (item as any).size : 0, // Fallback to legacy 'size' if exists
    status: item.status === 'completed' || item.status === 'failed' || item.status === 'canceled' ? item.status : 'completed',
    errorCode: item.errorCode,
    errorMessage: item.errorMessage ? String(item.errorMessage) : undefined,
  };
}

export class NativeHistoryService {
  private items: HistoryItem[] = [];
  private readonly HISTORY_FILE = 'history.json';
  private readonly FILE_VERSION = '1.0.0';
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize service by loading history from disk
   * Must be called after construction
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      const fileData = await readJsonFile<unknown>(this.HISTORY_FILE, {
        version: this.FILE_VERSION,
        data: [],
      });

      if (isHistoryFileFormat(fileData)) {
        this.items = fileData.data
          .map((item) => normalizeHistoryItem(item as Partial<HistoryItem>))
          .filter((item): item is HistoryItem => item !== null);
        return;
      }

      this.items = [];
    })();

    return this.initializationPromise;
  }

  /**
   * Ensure service is initialized before proceeding
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      await this.initialize();
    } else {
      await this.initializationPromise;
    }
  }

  /**
   * Persist current history to disk
   */
  private async persist(): Promise<void> {
    await writeJsonFile<HistoryFileFormat>(this.HISTORY_FILE, {
      version: this.FILE_VERSION,
      data: this.items,
    });
  }

  async getAll(): Promise<HistoryItem[]> {
    await this.ensureInitialized();
    return [...this.items];
  }

  async add(item: HistoryItem): Promise<HistoryItem> {
    await this.ensureInitialized();
    this.items = [item, ...this.items.filter((i) => i.id !== item.id)];
    await this.persist();
    return item;
  }

  async remove(id: string): Promise<string> {
    await this.ensureInitialized();
    this.items = this.items.filter((i) => i.id !== id);
    await this.persist();
    return id;
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.items = [];
    await this.persist();
  }
}
