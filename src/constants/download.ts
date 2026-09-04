export const CONCURRENT_DOWNLOAD_OPTIONS = [1, 2, 3, 4, 5, 10] as const;

export const SPEED_LIMIT_OPTIONS = [
  { labelKey: "queue.speedLabels.500kb", value: 500 * 1024 },
  { labelKey: "queue.speedLabels.1mb", value: 1024 * 1024 },
  { labelKey: "queue.speedLabels.5mb", value: 5 * 1024 * 1024 },
  { labelKey: "queue.speedLabels.10mb", value: 10 * 1024 * 1024 },
  { labelKey: "queue.speedLabels.unlimited", value: "unlimited" }
] as const;
