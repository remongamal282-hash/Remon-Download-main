import type { AppErrorCode, ErrorModel } from "../types/errors";

const errorMessages: Record<AppErrorCode, string> = {
  unsupported_url: "errors.unsupportedUrl",
  network_error: "errors.networkError",
  video_unavailable: "errors.videoUnavailable",
  video_private: "errors.videoPrivate",
  disk_full: "errors.diskFull",
  permission_denied: "errors.permissionDenied",
  ytdlp_error: "errors.ytdlpError",
  ytdlp_not_found: "errors.ytdlpNotFound",
  ffmpeg_error: "errors.ffmpegError",
  unknown: "errors.unknown"
};

export function mapMockError(code: AppErrorCode): ErrorModel {
  return {
    code,
    message: errorMessages[code],
    recoverable: true
  };
}

export function mapUnknownError(error: unknown): ErrorModel {
  if (error instanceof Error) {
    return {
      code: "unknown",
      message: error.message,
      recoverable: true
    };
  }

  return {
    code: "unknown",
    message: "Unknown error",
    recoverable: true
  };
}
