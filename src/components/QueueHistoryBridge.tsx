import { useEffect } from "react";
import { useHistoryStore } from "../stores/historyStore";
import { useQueueStore } from "../stores/queueStore";
import type { DownloadItem } from "../types/download";

function shouldRecordHistory(item: DownloadItem): boolean {
  return ["completed", "failed", "canceled"].includes(item.status) && !item.historyRecordedAt;
}

export function QueueHistoryBridge() {
  const items = useQueueStore((state) => state.items);
  const markHistoryRecorded = useQueueStore((state) => state.markHistoryRecorded);
  const addFromDownload = useHistoryStore((state) => state.addFromDownload);

  useEffect(() => {
    const recordableItems = items.filter(shouldRecordHistory);

    for (const item of recordableItems) {
      const recordedAt = new Date().toISOString();
      markHistoryRecorded(item.id, recordedAt);
      void addFromDownload({ ...item, historyRecordedAt: recordedAt }, recordedAt);
    }
  }, [addFromDownload, items, markHistoryRecorded]);

  return null;
}
