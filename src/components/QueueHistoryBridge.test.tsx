import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { QueueHistoryBridge } from "./QueueHistoryBridge";
import { useHistoryStore } from "../stores/historyStore";
import { useQueueStore } from "../stores/queueStore";
import type { VideoMetadata } from "../types/download";

const metadata: VideoMetadata = {
  id: "video-bridge",
  sourceUrl: "https://www.youtube.com/watch?v=bridge",
  linkType: "video",
  thumbnail: "https://example.com/thumb.jpg",
  title: "Bridge Video",
  channelName: "Bridge Channel",
  duration: "10:00",
  views: 100,
  qualityOptions: ["1080p"],
  videoFormats: ["mp4"],
  audioFormats: ["m4a"],
  resolution: "1080p",
  fps: 60,
  videoCodec: "H.264",
  audioCodec: "AAC",
  videoBitrate: "8 Mbps",
  audioBitrate: "192 Kbps",
  container: "mp4",
  fileSize: 1024,
  uploadDate: "2026-08-01"
};

describe("QueueHistoryBridge", () => {
  beforeEach(async () => {
    await useHistoryStore.getState().clear();
    useHistoryStore.getState().clearError();
    useQueueStore.getState().clear();
  });

  it("records completed queue items into history", async () => {
    render(<QueueHistoryBridge />);

    act(() => {
      const item = useQueueStore.getState().addFromMetadata(metadata, "1080p", "mp4");
      useQueueStore.setState({
        items: [{ ...item, status: "completed", progress: 100, downloadedSize: item.fileSize }]
      });
    });

    await waitFor(() => expect(useHistoryStore.getState().items).toHaveLength(1));
    expect(useHistoryStore.getState().items[0]).toMatchObject({
      title: metadata.title,
      sourceUrl: metadata.sourceUrl,
      status: "completed"
    });
    expect(useQueueStore.getState().items[0]?.historyRecordedAt).toBeTruthy();
  });

  it("records failed and canceled queue items into history", async () => {
    render(<QueueHistoryBridge />);

    act(() => {
      const [failed, canceled] = useQueueStore.getState().addManyFromMetadata(
        [
          { ...metadata, id: "failed-video", title: "Failed Bridge Video" },
          { ...metadata, id: "canceled-video", title: "Canceled Bridge Video" }
        ],
        "720p",
        "webm"
      );
      useQueueStore.setState({
        items: [
          { ...failed, status: "failed", errorCode: "network_error", errorMessage: "errors.networkError" },
          { ...canceled, status: "canceled" }
        ]
      });
    });

    await waitFor(() => expect(useHistoryStore.getState().items).toHaveLength(2));
    expect(useHistoryStore.getState().items.map((item) => item.status).sort()).toEqual(["canceled", "failed"]);
  });
});
