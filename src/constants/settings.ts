import type { AppSettings } from "../types/settings";

export const QUALITY_OPTIONS = ["2160p", "1440p", "1080p", "720p", "480p", "360p"] as const;
export const VIDEO_FORMAT_OPTIONS = ["mp4", "webm", "mkv", "mp3"] as const;
export const AUDIO_FORMAT_OPTIONS = ["mp3", "opus"] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  downloadFolder: "~/Downloads",
  startWithWindows: false,
  minimizeToTray: false,
  appearance: "system",
  language: "en",
  concurrentDownloads: 3,
  speedLimit: "unlimited",
  defaultQuality: "720p",
  defaultVideoFormat: "mp4",
  defaultAudioFormat: "mp3",
  enableNotifications: true,
  notificationWhenCompleted: true,
  notificationWhenFailed: true,
  clipboardMonitoring: false,
  askBeforeDownloading: true,
  fileNameTemplate: "%(uploader)s - %(title)s [%(resolution)s].%(ext)s",
  ytdlpPath: "",
  ffmpegPath: "",
  proxy: ""
};
