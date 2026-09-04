import { create } from "zustand";
import { resolveHistoryService } from "../services/serviceResolver";
import type { DownloadItem, HistoryItem } from "../types/download";
import type { ErrorModel } from "../types/errors";
import { useQueueStore } from "./queueStore";

interface HistoryState {
  items: HistoryItem[];
  isLoading: boolean;
  error: ErrorModel | null;
  load: () => Promise<void>;
  addFromDownload: (item: DownloadItem, now?: string) => Promise<HistoryItem | null>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  redownload: (id: string) => boolean;
  openFolder: (id: string) => boolean;
  failNext: (error: ErrorModel) => void;
  clearError: () => void;
  resetForTests: () => void;
}

function toErrorModel(error: unknown): ErrorModel {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    return error as ErrorModel;
  }

  return {
    code: "unknown",
    message: "errors.unknown",
    recoverable: true
  };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  load: async () => {
    set({ isLoading: true, error: null });

    try {
      const items = await resolveHistoryService().getAll();
      set({ items, isLoading: false });
    } catch (error) {
      set({ error: toErrorModel(error), isLoading: false });
    }
  },
  addFromDownload: async (item, now = new Date().toISOString()) => {
    try {
      const historyItem = await resolveHistoryService().addFromDownload(item, now);
      set((state) => ({
        items: [historyItem, ...state.items.filter((existingItem) => existingItem.id !== historyItem.id)],
        error: null
      }));
      return historyItem;
    } catch (error) {
      set({ error: toErrorModel(error) });
      return null;
    }
  },
  remove: async (id) => {
    try {
      await resolveHistoryService().remove(id);
      set((state) => ({ items: state.items.filter((item) => item.id !== id), error: null }));
    } catch (error) {
      set({ error: toErrorModel(error) });
    }
  },
  clear: async () => {
    try {
      await resolveHistoryService().clear();
      set({ items: [], error: null });
    } catch (error) {
      set({ error: toErrorModel(error) });
    }
  },
  redownload: (id) => {
    const item = get().items.find((historyItem) => historyItem.id === id);

    if (!item) {
      set({
        error: {
          code: "unknown",
          message: "history.errors.notFound",
          recoverable: true
        }
      });
      return false;
    }

    useQueueStore.getState().addFromHistoryItem(item);
    return true;
  },
  openFolder: (id) => {
    const itemExists = get().items.some((item) => item.id === id);

    if (!itemExists) {
      set({
        error: {
          code: "unknown",
          message: "history.errors.notFound",
          recoverable: true
        }
      });
      return false;
    }

    return true;
  },
  failNext: (error) => resolveHistoryService().failNext(error),
  clearError: () => set({ error: null }),
  resetForTests: () => {
    void resolveHistoryService().clear();
    set({ items: [], isLoading: false, error: null });
  }
}));
