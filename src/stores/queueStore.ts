import { create } from "zustand";
import { resolveDownloadService } from "../services/serviceResolver";
import type { DownloadItem, DownloadStatus, FavoriteItem, HistoryItem, VideoMetadata } from "../types/download";
import type { AppErrorCode, ErrorModel } from "../types/errors";
import type { SpeedLimit } from "../types/settings";
import { mapMockError } from "../utils/errors";

interface QueueState {
  items: DownloadItem[];
  lastError: ErrorModel | null;
  load: () => Promise<void>;
  addFromMetadata: (metadata: VideoMetadata, quality: string, format: string) => DownloadItem;
  addManyFromMetadata: (metadata: VideoMetadata[], quality: string, format: string) => DownloadItem[];
  addFromHistoryItem: (item: HistoryItem) => DownloadItem;
  addFromFavoriteItem: (item: FavoriteItem, quality: string, format: string) => DownloadItem;
  pause: (id: string) => void;
  resume: (id: string) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  simulateError: (id: string, code: AppErrorCode) => void;
  reorder: (activeId: string, overId: string) => void;
  tick: (concurrentDownloads: number, speedLimit: SpeedLimit, now?: number) => void;
  markHistoryRecorded: (id: string, recordedAt: string) => void;
  remove: (id: string) => Promise<void>;
  clear: () => void;
  clearLastError: () => void;
}

const activeStatuses: readonly DownloadStatus[] = ["analyzing", "downloading", "merging", "converting", "retrying"];
const terminalStatuses: readonly DownloadStatus[] = ["completed", "failed", "canceled"];

function normalizeOrder(items: DownloadItem[]): DownloadItem[] {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

function updateItem(
  items: DownloadItem[],
  id: string,
  updater: (item: DownloadItem) => DownloadItem
): DownloadItem[] {
  return items.map((item) => (item.id === id ? updater(item) : item));
}

function safeUpdateItem(
  items: DownloadItem[],
  id: string,
  updater: (item: DownloadItem) => DownloadItem
): { items: DownloadItem[]; error: ErrorModel | null } {
  try {
    return { items: updateItem(items, id, updater), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forbidden queue operation";
    return {
      items,
      error: {
        code: "unknown",
        message,
        recoverable: true
      }
    };
  }
}

function fillAvailableSlots(items: DownloadItem[], concurrentDownloads: number, now: number): DownloadItem[] {
  const sortedItems = [...items].sort((a, b) => a.order - b.order);
  const activeCount = sortedItems.filter((item) => activeStatuses.includes(item.status)).length;
  let remainingSlots = Math.max(0, concurrentDownloads - activeCount);

  return sortedItems.map((item) => {
    if (remainingSlots <= 0 || item.status !== "queued") {
      return item;
    }

    remainingSlots -= 1;
    return resolveDownloadService().transition(item, "analyzing", now);
  });
}

export const useQueueStore = create<QueueState>((set, get) => {
  // Subscribe to download service updates in Electron mode
  const downloadService = resolveDownloadService();
  if (downloadService.onItemUpdate) {
    downloadService.onItemUpdate((id, updatedItem) => {
      set((state) => ({
        items: state.items.map((item) => (item.id === id ? updatedItem : item))
      }));
    });
  }

  return {
    items: [],
    lastError: null,
    load: async () => {
      const service = resolveDownloadService();
      if (!service.getAll) {
        return;
      }

      const items = await service.getAll();
      set({ items: normalizeOrder(items), lastError: null });
    },
    addFromMetadata: (metadata, quality, format) => {
      const order = get().items.length + 1;
      const item = resolveDownloadService().createFromMetadata(metadata, order, quality, format);
      set((state) => ({ items: [...state.items, item] }));
      return item;
    },
    addManyFromMetadata: (metadata, quality, format) => {
      const startOrder = get().items.length + 1;
      const items = metadata.map((video, index) =>
        resolveDownloadService().createFromMetadata(video, startOrder + index, quality, format)
      );
      set((state) => ({ items: [...state.items, ...items] }));
      return items;
    },
    addFromHistoryItem: (historyItem) => {
      const order = get().items.length + 1;
      const item = resolveDownloadService().createFromHistoryItem(historyItem, order);
      set((state) => ({ items: [...state.items, item] }));
      return item;
    },
    addFromFavoriteItem: (favoriteItem, quality, format) => {
      const order = get().items.length + 1;
      const item = resolveDownloadService().createFromFavoriteItem(favoriteItem, order, quality, format);
      set((state) => ({ items: [...state.items, item] }));
      return item;
    },
    pause: (id) => {
      set((state) => {
        const result = safeUpdateItem(state.items, id, (item) =>
          resolveDownloadService().transition(item, "paused", Date.now())
        );
        return { items: result.items, lastError: result.error };
      });
    },
    resume: (id) => {
      set((state) => {
        const result = safeUpdateItem(state.items, id, (item) =>
          resolveDownloadService().transition(item, "downloading", Date.now())
        );
        return { items: result.items, lastError: result.error };
      });
    },
    cancel: (id) => {
      set((state) => {
        const result = safeUpdateItem(state.items, id, (item) =>
          resolveDownloadService().transition(item, "canceled", Date.now())
        );
        return { items: result.items, lastError: result.error };
      });
    },
    retry: (id) => {
      set((state) => {
        const result = safeUpdateItem(state.items, id, (item) => resolveDownloadService().retry(item, Date.now()));
        return { items: result.items, lastError: result.error };
      });
    },
    simulateError: (id, code) => {
      set((state) => {
        const error = mapMockError(code);
        const result = safeUpdateItem(state.items, id, (item) => resolveDownloadService().fail(item, error, Date.now()));
        return { items: result.items, lastError: result.error ?? error };
      });
    },
    reorder: (activeId, overId) => {
      set((state) => {
        const activeIndex = state.items.findIndex((item) => item.id === activeId);
        const overIndex = state.items.findIndex((item) => item.id === overId);

        if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
          return state;
        }

        const nextItems = [...state.items];
        const [movedItem] = nextItems.splice(activeIndex, 1);
        nextItems.splice(overIndex, 0, movedItem);

        return { items: normalizeOrder(nextItems), lastError: null };
      });
    },
    tick: (concurrentDownloads, speedLimit, now = Date.now()) => {
      set((state) => {
        const advancedItems = state.items.map((item) => resolveDownloadService().tick(item, now, speedLimit));
        const refillableItems = advancedItems.some((item, index) => item.status !== state.items[index]?.status)
          ? fillAvailableSlots(advancedItems, concurrentDownloads, now)
          : advancedItems;

        const hasActiveItems = refillableItems.some((item) => activeStatuses.includes(item.status));
        const hasQueuedItems = refillableItems.some((item) => item.status === "queued");
        const nextItems = hasActiveItems || !hasQueuedItems
          ? refillableItems
          : fillAvailableSlots(refillableItems, concurrentDownloads, now);

        return { items: normalizeOrder(nextItems), lastError: state.lastError };
      });
    },
    remove: async (id) => {
      await resolveDownloadService().remove(id);
      set((state) => ({
        items: state.items
          .filter((item) => item.id !== id)
          .map((item, index) => ({ ...item, order: index + 1 }))
      }));
    },
    markHistoryRecorded: (id, recordedAt) => {
      set((state) => ({
        items: state.items.map((item) => (item.id === id ? { ...item, historyRecordedAt: recordedAt } : item))
      }));
    },
    clear: () => set({ items: [], lastError: null }),
    clearLastError: () => set({ lastError: null })
  };
});

export function getQueueSummary(items: DownloadItem[]) {
  return {
    total: items.length,
    active: items.filter((item) => activeStatuses.includes(item.status)).length,
    completed: items.filter((item) => item.status === "completed").length,
    stopped: items.filter((item) => terminalStatuses.includes(item.status)).length
  };
}
