export type AppearanceMode = "light" | "dark" | "system";
export type AppLanguage = "ar" | "en";
export type SpeedLimit = number | "unlimited";

export interface AppSettings {
  downloadFolder: string;
  startWithWindows: boolean;
  minimizeToTray: boolean;
  appearance: AppearanceMode;
  language: AppLanguage;
  concurrentDownloads: 1 | 2 | 3 | 4 | 5 | 10;
  speedLimit: SpeedLimit;
  defaultQuality: string;
  defaultVideoFormat: string;
  defaultAudioFormat: string;
  enableNotifications: boolean;
  notificationWhenCompleted: boolean;
  notificationWhenFailed: boolean;
  clipboardMonitoring: boolean;
  askBeforeDownloading: boolean;
  fileNameTemplate: string;
  ytdlpPath: string;
  ffmpegPath: string;
  proxy: string;
}
