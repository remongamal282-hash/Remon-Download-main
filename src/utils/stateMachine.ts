import type { DownloadStatus } from "../types/download";

const allowedTransitions: Readonly<Record<DownloadStatus, readonly DownloadStatus[]>> = {
  queued: ["analyzing", "canceled"],
  analyzing: ["downloading", "failed", "canceled"],
  downloading: ["paused", "merging", "completed", "failed", "canceled"],
  paused: ["downloading", "canceled", "failed"],
  merging: ["converting", "failed", "canceled"],
  converting: ["completed", "failed", "canceled"],
  completed: [],
  failed: ["retrying"],
  canceled: ["retrying"],
  retrying: ["analyzing", "downloading"]
};

export function canTransition(from: DownloadStatus, to: DownloadStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: DownloadStatus, to: DownloadStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Forbidden transition: ${from} -> ${to}`);
  }
}

export function getAllowedTransitions(status: DownloadStatus): readonly DownloadStatus[] {
  return allowedTransitions[status];
}

export const ALL_DOWNLOAD_STATUSES: readonly DownloadStatus[] = [
  "queued",
  "analyzing",
  "downloading",
  "paused",
  "merging",
  "converting",
  "completed",
  "failed",
  "canceled",
  "retrying"
] as const;
