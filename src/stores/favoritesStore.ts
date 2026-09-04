import { create } from "zustand";
import { resolveFavoritesService } from "../services/serviceResolver";
import type { FavoriteItem } from "../types/download";
import type { ErrorModel } from "../types/errors";
import { useQueueStore } from "./queueStore";

interface FavoritesState {
  items: FavoriteItem[];
  isLoading: boolean;
  error: ErrorModel | null;
  load: () => Promise<void>;
  add: (item: FavoriteItem) => Promise<FavoriteItem | null>;
  remove: (id: string) => Promise<void>;
  isFavorite: (sourceUrl: string) => Promise<boolean>;
  download: (id: string, quality: string, format: string) => boolean;
  failNext: (error: ErrorModel) => void;
  clearError: () => void;
  clearMockData: () => Promise<void>;
  resetForTests: () => Promise<void>;
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

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  load: async () => {
    set({ isLoading: true, error: null });

    try {
      const items = await resolveFavoritesService().getAll();
      set({ items, isLoading: false });
    } catch (error) {
      console.error('[favoritesStore] Failed to load favorites:', error);
      set({ error: toErrorModel(error), isLoading: false });
    }
  },
  add: async (item) => {
    try {
      const favorite = await resolveFavoritesService().add(item);
      set((state) => ({
        items: [favorite, ...state.items.filter((existingItem) => existingItem.sourceUrl !== favorite.sourceUrl)],
        error: null
      }));
      return favorite;
    } catch (error) {
      set({ error: toErrorModel(error) });
      return null;
    }
  },
  remove: async (id) => {
    try {
      await resolveFavoritesService().remove(id);
      set((state) => ({ items: state.items.filter((item) => item.id !== id), error: null }));
    } catch (error) {
      set({ error: toErrorModel(error) });
    }
  },
  isFavorite: async (sourceUrl) => {
    try {
      const result = await resolveFavoritesService().isFavorite(sourceUrl);
      set({ error: null });
      return result;
    } catch (error) {
      set({ error: toErrorModel(error) });
      return false;
    }
  },
  download: (id, quality, format) => {
    const item = get().items.find((favoriteItem) => favoriteItem.id === id);

    if (!item) {
      set({
        error: {
          code: "unknown",
          message: "favorites.errors.notFound",
          recoverable: true
        }
      });
      return false;
    }

    useQueueStore.getState().addFromFavoriteItem(item, quality, format);
    return true;
  },
  failNext: (error) => resolveFavoritesService().failNext(error),
  clearError: () => set({ error: null }),
  clearMockData: async () => {
    await resolveFavoritesService().clear();
    set({ items: [], isLoading: false, error: null });
  },
  resetForTests: async () => {
    await get().clearMockData();
  }
}));
