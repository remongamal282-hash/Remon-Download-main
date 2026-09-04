export type AppErrorCode =
  | "unsupported_url"
  | "network_error"
  | "video_unavailable"
  | "video_private"
  | "disk_full"
  | "permission_denied"
  | "ytdlp_error"
  | "ytdlp_not_found"
  | "ffmpeg_error"
  | "unknown";

export interface ErrorModel {
  code: AppErrorCode;
  message: string;
  recoverable: boolean;
}

export const MOCK_ERROR_CODES: readonly AppErrorCode[] = [
  "network_error",
  "video_unavailable",
  "video_private",
  "disk_full",
  "permission_denied",
  "ytdlp_error",
  "ytdlp_not_found",
  "ffmpeg_error"
] as const;
