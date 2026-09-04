import { z } from "zod";
import { DEFAULT_SETTINGS } from "../constants/settings";
import type { AppSettings } from "../types/settings";

export interface SettingsService {
  get(): AppSettings;
  update(settings: Partial<AppSettings>): AppSettings;
  reset(): AppSettings;
}

const STORAGE_KEY = "remon-download-settings";

const settingsSchema = z.object({
  downloadFolder: z.string(),
  startWithWindows: z.boolean(),
  minimizeToTray: z.boolean(),
  appearance: z.enum(["light", "dark", "system"]),
  language: z.enum(["ar", "en"]),
  concurrentDownloads: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(10)
  ]),
  speedLimit: z.union([z.number().positive(), z.literal("unlimited")]),
  defaultQuality: z.string(),
  defaultVideoFormat: z.string(),
  defaultAudioFormat: z.string(),
  enableNotifications: z.boolean(),
  notificationWhenCompleted: z.boolean(),
  notificationWhenFailed: z.boolean(),
  clipboardMonitoring: z.boolean(),
  askBeforeDownloading: z.boolean(),
  fileNameTemplate: z.string(),
  ytdlpPath: z.string(),
  ffmpegPath: z.string(),
  proxy: z.string()
});

export class LocalStorageSettingsService implements SettingsService {
  get(): AppSettings {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    try {
      const parsed = JSON.parse(raw);
      return settingsSchema.parse({ ...DEFAULT_SETTINGS, ...parsed });
    } catch {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
  }

  update(settings: Partial<AppSettings>): AppSettings {
    const nextSettings = settingsSchema.parse({ ...this.get(), ...settings });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
    return nextSettings;
  }

  reset(): AppSettings {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    return DEFAULT_SETTINGS;
  }
}

export const settingsService: SettingsService = new LocalStorageSettingsService();
