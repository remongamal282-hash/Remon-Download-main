import type { DownloadItem, HistoryItem } from "../types/download";
import type { ErrorModel } from "../types/errors";

export interface HistoryService {
  getAll(): Promise<HistoryItem[]>;
  add(item: HistoryItem): Promise<HistoryItem>;
  addFromDownload(item: DownloadItem, now: string): Promise<HistoryItem>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  failNext(error: ErrorModel): void;
}

export class MockHistoryService implements HistoryService {
  private items: HistoryItem[] = [];
  private nextError: ErrorModel | null = null;

  async getAll(): Promise<HistoryItem[]> {
    await this.delay();
    this.throwIfNeeded();
    return [...this.items];
  }

  async add(item: HistoryItem): Promise<HistoryItem> {
    await this.delay();
    this.throwIfNeeded();
    this.items = [item, ...this.items.filter((existingItem) => existingItem.id !== item.id)];
    return item;
  }

  async addFromDownload(item: DownloadItem, now: string): Promise<HistoryItem> {
    const historyItem: HistoryItem = {
      id: `history-${item.id}`,
      sourceDownloadId: item.id,
      metadataId: item.metadataId,
      thumbnail: item.thumbnail,
      title: item.title,
      sourceUrl: item.sourceUrl,
      date: now,
      quality: item.quality,
      format: item.format,
      fileSize: item.fileSize,
      status: item.status === "completed" ? "completed" : item.status === "failed" ? "failed" : "canceled",
      errorCode: item.errorCode,
      errorMessage: item.errorMessage
    };

    return this.add(historyItem);
  }

  async remove(id: string): Promise<void> {
    await this.delay();
    this.throwIfNeeded();
    this.items = this.items.filter((item) => item.id !== id);
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

export const historyService: HistoryService = new MockHistoryService();
