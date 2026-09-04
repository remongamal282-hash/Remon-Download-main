/**
 * NativeFavoritesService — Main Process favorites boundary with persistent storage.
 *
 * Phase 3.1: Persistent storage using fs-based JSON files.
 * Favorites are stored in %APPDATA%/remon-download/favorites.json
 *
 * Note: remove() returns string (id) to match the IPC contract response type,
 * unlike MockFavoritesService which returns void.
 */
import type { FavoriteItem } from '../../src/types/download';
import { readJsonFile, writeJsonFile } from '../utils/fileStorage';

interface FavoritesFileFormat {
  version: string;
  data: FavoriteItem[];
}

function isFavoritesFileFormat(value: unknown): value is FavoritesFileFormat {
  return !!value && typeof value === 'object' && 'data' in value && Array.isArray((value as { data?: unknown }).data);
}

function normalizeFavoriteItem(item: Partial<FavoriteItem> | null | undefined): FavoriteItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const dateValue = typeof item.dateAdded === 'string' ? item.dateAdded : new Date().toISOString();
  const parsedDate = new Date(dateValue);
  const normalizedDate = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();

  return {
    id: String(item.id ?? crypto.randomUUID()),
    sourceUrl: String(item.sourceUrl ?? ''),
    thumbnail: String(item.thumbnail ?? ''),
    title: String(item.title ?? 'Untitled Favorite'),
    channel: String(item.channel ?? 'Unknown channel'),
    dateAdded: normalizedDate,
  };
}

export class NativeFavoritesService {
  private items: FavoriteItem[] = [];
  private readonly FAVORITES_FILE = 'favorites.json';
  private readonly FILE_VERSION = '1.0.0';
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize service by loading favorites from disk
   * Must be called after construction
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      const fileData = await readJsonFile<unknown>(
        this.FAVORITES_FILE,
        {
          version: this.FILE_VERSION,
          data: [],
        }
      );

      if (isFavoritesFileFormat(fileData)) {
        this.items = fileData.data
          .map((item) => normalizeFavoriteItem(item as Partial<FavoriteItem>))
          .filter((item): item is FavoriteItem => item !== null);
        return;
      }

      // Backward compatibility: older or malformed favorites files may be stored
      // as a bare array or any other non-standard structure. Fall back safely.
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
   * Persist current favorites to disk
   */
  private async persist(): Promise<void> {
    await writeJsonFile<FavoritesFileFormat>(this.FAVORITES_FILE, {
      version: this.FILE_VERSION,
      data: this.items,
    });
  }

  async getAll(): Promise<FavoriteItem[]> {
    await this.ensureInitialized();
    return [...this.items];
  }

  async add(item: FavoriteItem): Promise<FavoriteItem> {
    this.items = [item, ...this.items.filter((i) => i.id !== item.id)];
    await this.persist();
    return item;
  }

  async remove(id: string): Promise<string> {
    this.items = this.items.filter((i) => i.id !== id);
    await this.persist();
    return id;
  }
}
