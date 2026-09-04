import { create } from "zustand";
import i18n from "../i18n";
import { resolveSettingsService } from "../services/serviceResolver";
import type { AppSettings } from "../types/settings";
import { DEFAULT_SETTINGS } from "../constants/settings";

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

export function applyDocumentPreferences(settings: AppSettings): void {
  document.documentElement.lang = settings.language;
  document.documentElement.dir = settings.language === "ar" ? "rtl" : "ltr";

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const useDark = settings.appearance === "dark" || (settings.appearance === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", useDark);
  void i18n.changeLanguage(settings.language);
}

const settingsService = resolveSettingsService();

function getElectronSettingsApi() {
  if (typeof window === "undefined" || !window.electronAPI?.settings) {
    return null;
  }

  return window.electronAPI.settings;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const electronSettings = getElectronSettingsApi();
      const settings = electronSettings ? await electronSettings.get() : settingsService.get();
      applyDocumentPreferences(settings);
      set({ settings, isLoading: false });
    } catch (error) {
      console.error('[settingsStore] Failed to load settings:', error);
      applyDocumentPreferences(DEFAULT_SETTINGS);
      set({ settings: DEFAULT_SETTINGS, isLoading: false });
    }
  },

  updateSettings: async (patch) => {
    try {
      const electronSettings = getElectronSettingsApi();
      const nextSettings = electronSettings ? await electronSettings.update(patch) : settingsService.update(patch);
      applyDocumentPreferences(nextSettings);
      set({ settings: nextSettings });
    } catch (error) {
      console.error('[settingsStore] Failed to update settings:', error);
    }
  },

  resetSettings: async () => {
    try {
      const electronSettings = getElectronSettingsApi();
      const nextSettings = electronSettings ? await electronSettings.reset() : settingsService.reset();
      applyDocumentPreferences(nextSettings);
      set({ settings: nextSettings });
    } catch (error) {
      console.error('[settingsStore] Failed to reset settings:', error);
    }
  }
}));

export function initializeSettings(): void {
  // Load settings asynchronously
  void useSettingsStore.getState().loadSettings();
}
