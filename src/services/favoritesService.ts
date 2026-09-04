import type { FavoriteItem } from "../types/download";
import type { ErrorModel } from "../types/errors";

export interface FavoritesService {
  getAll(): Promise<FavoriteItem[]>;
  add(item: FavoriteItem): Promise<FavoriteItem>;
  remove(id: string): Promise<void>;
  isFavorite(sourceUrl: string): Promise<boolean>;
  clear(): Promise<void>;
  failNext(error: ErrorModel): void;
}

const initialFavorites: FavoriteItem[] = [
  {
    id: "favorite-1",
    sourceUrl: "https://www.youtube.com/watch?v=favorite-nature",
    thumbnail: "https://picsum.photos/seed/remon-favorite-1/320/180",
    title: "Amazing Nature Documentary",
    channel: "Example Channel",
    dateAdded: "2026-08-12T10:00:00.000Z"
  },
  {
    id: "favorite-2",
    sourceUrl: "https://www.youtube.com/watch?v=favorite-city",
    thumbnail: "https://picsum.photos/seed/remon-favorite-2/320/180",
    title: "City Timelapse in 4K",
    channel: "Urban Frames",
    dateAdded: "2026-08-13T09:30:00.000Z"
  }
];

export class MockFavoritesService implements FavoritesService {
  private items: FavoriteItem[] = [...initialFavorites];
  private nextError: ErrorModel | null = null;

  async getAll(): Promise<FavoriteItem[]> {
    await this.delay();
    this.throwIfNeeded();
    return [...this.items];
  }

  async add(item: FavoriteItem): Promise<FavoriteItem> {
    await this.delay();
    this.throwIfNeeded();
    
    // Normalize dateAdded to ensure it's always a valid ISO string
    const dateAdded = this.normalizeDateString(item.dateAdded);
    
    const newItem = {
      ...item,
      dateAdded,
    };
    this.items = [newItem, ...this.items.filter((existingItem) => existingItem.sourceUrl !== newItem.sourceUrl)];
    return newItem;
  }

  /**
   * Normalize a date string to ensure it's a valid ISO format
   * Handles null, undefined, and invalid date strings
   */
  private normalizeDateString(dateStr: string | undefined): string {
    if (!dateStr) {
      return new Date().toISOString();
    }
    
    // Try to parse and validate the date
    const parsedDate = new Date(dateStr);
    if (isNaN(parsedDate.getTime())) {
      // If invalid, return current timestamp
      return new Date().toISOString();
    }
    
    // Return the valid date in ISO format
    return parsedDate.toISOString();
  }

  async remove(id: string): Promise<void> {
    await this.delay();
    this.throwIfNeeded();
    this.items = this.items.filter((item) => item.id !== id);
  }

  async isFavorite(sourceUrl: string): Promise<boolean> {
    await this.delay();
    this.throwIfNeeded();
    return this.items.some((item) => item.sourceUrl === sourceUrl);
  }

  async clear(): Promise<void> {
    await this.delay();
    this.throwIfNeeded();
    this.items = [];
  }

  failNext(error: ErrorModel): void {
    this.nextError = error;
  }

  private async delay(): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  private throwIfNeeded(): void {
    if (!this.nextError) {
      return;
    }

    const error = this.nextError;
    this.nextError = null;
    throw error;
  }
}

export const favoritesService: FavoritesService = new MockFavoritesService();
