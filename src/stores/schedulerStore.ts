import { create } from "zustand";
import { resolveSchedulerService } from "../services/serviceResolver";
import type { SchedulerInput } from "../services/schedulerService";
import type { ScheduledDownload } from "../types/download";
import type { ErrorModel } from "../types/errors";
import { useQueueStore } from "./queueStore";
import { useSettingsStore } from "./settingsStore";

interface SchedulerState {
  items: ScheduledDownload[];
  isLoading: boolean;
  error: ErrorModel | null;
  lastTriggeredId: string | null;
  load: () => Promise<void>;
  create: (input: SchedulerInput) => Promise<ScheduledDownload | null>;
  update: (id: string, input: SchedulerInput) => Promise<ScheduledDownload | null>;
  cancel: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  tick: (now?: number) => Promise<number>;
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

let schedulerTickInFlight = false;

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  lastTriggeredId: null,
  load: async () => {
    set((state) => ({ isLoading: state.items.length === 0, error: null }));

    try {
      const items = await resolveSchedulerService().getAll();
      set({ items, isLoading: false });
    } catch (error) {
      set({ error: toErrorModel(error), isLoading: false });
    }
  },
  create: async (input) => {
    try {
      const item = await resolveSchedulerService().create(input);
      set((state) => ({ items: [item, ...state.items], error: null }));
      return item;
    } catch (error) {
      set({ error: toErrorModel(error) });
      return null;
    }
  },
  update: async (id, input) => {
    try {
      const item = await resolveSchedulerService().update(id, input);
      set((state) => ({
        items: state.items.map((existingItem) => (existingItem.id === id ? item : existingItem)),
        error: null
      }));
      return item;
    } catch (error) {
      set({ error: toErrorModel(error) });
      return null;
    }
  },
  cancel: async (id) => {
    try {
      const item = await resolveSchedulerService().cancel(id);
      set((state) => ({
        items: state.items.map((existingItem) => (existingItem.id === id ? item : existingItem)),
        error: null
      }));
    } catch (error) {
      set({ error: toErrorModel(error) });
    }
  },
  remove: async (id) => {
    try {
      await resolveSchedulerService().remove(id);
      set((state) => ({ items: state.items.filter((item) => item.id !== id), error: null }));
    } catch (error) {
      set({ error: toErrorModel(error) });
    }
  },
  tick: async (now = Date.now()) => {
    if (schedulerTickInFlight) {
      return 0;
    }

    schedulerTickInFlight = true;

    try {
      const result = await resolveSchedulerService().tick(now);
      const settings = useSettingsStore.getState().settings;

      const seenTriggeredScheduleIds = new Set<string>();

      result.triggered.forEach((triggered) => {
        const identityKey = `${triggered.schedule.id}:${triggered.schedule.triggerCount}`;
        if (seenTriggeredScheduleIds.has(identityKey)) {
          return;
        }

        seenTriggeredScheduleIds.add(identityKey);

        useQueueStore.getState().addManyFromMetadata(
          triggered.metadata,
          settings.defaultQuality,
          settings.defaultVideoFormat
        );
      });

      set({
        items: result.items,
        error: null,
        lastTriggeredId: result.triggered.length > 0
          ? result.triggered[result.triggered.length - 1]?.schedule.id ?? null
          : null
      });
      return result.triggered.length;
    } catch (error) {
      set({ error: toErrorModel(error) });
      return 0;
    } finally {
      schedulerTickInFlight = false;
    }
  },
  failNext: (error) => resolveSchedulerService().failNext(error),
  clearError: () => set({ error: null, lastTriggeredId: null }),
  clearMockData: async () => {
    await resolveSchedulerService().clear();
    set({ items: [], isLoading: false, error: null, lastTriggeredId: null });
  },
  resetForTests: async () => {
    await get().clearMockData();
  }
}));
