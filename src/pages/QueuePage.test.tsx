import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach } from "vitest";
import { QueuePage } from "./QueuePage";
import type { VideoMetadata } from "../types/download";
import { useQueueStore } from "../stores/queueStore";
import "../i18n";

const metadata: VideoMetadata = {
  id: "video-1",
  sourceUrl: "https://www.youtube.com/watch?v=abc",
  linkType: "video",
  thumbnail: "https://example.com/thumb.jpg",
  title: "Accessible Queue Item",
  channelName: "Test Channel",
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

describe("QueuePage", () => {
  beforeEach(() => {
    useQueueStore.getState().clear();
  });

  it("renders an accessible empty state", () => {
    render(<QueuePage />);
    expect(screen.getByRole("heading", { name: "No downloads yet" })).toBeInTheDocument();
  });

  it("supports keyboard-accessible queue controls", async () => {
    const user = userEvent.setup();
    const item = useQueueStore.getState().addFromMetadata(metadata, "1080p", "mp4");
    useQueueStore.getState().tick(1, "unlimited", 1000);
    useQueueStore.getState().tick(1, "unlimited", 1700);

    render(<QueuePage />);

    expect(screen.getByRole("progressbar", { name: /progress for accessible queue item/i })).toHaveAttribute(
      "aria-valuemin",
      "0"
    );

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(useQueueStore.getState().items.find((queueItem) => queueItem.id === item.id)?.status).toBe("paused");

    await user.click(screen.getByRole("button", { name: "Resume" }));
    // After resume, status may be downloading or a subsequent state like merging
    const itemStatus = useQueueStore.getState().items.find((queueItem) => queueItem.id === item.id)?.status;
    expect(["downloading", "merging", "converting", "completed"].includes(itemStatus ?? "")).toBe(true);
  });

  it("immediately displays a newly added scheduled item without leaving the page", async () => {
    render(<QueuePage />);
    expect(screen.getByRole("heading", { name: "No downloads yet" })).toBeInTheDocument();

    // Simulate item arriving in queueStore while on QueuePage
    act(() => {
      useQueueStore.setState((state) => ({
        items: [
          ...state.items,
          {
            id: "scheduled-to-queue-1",
            metadataId: "meta-sched",
            thumbnail: "https://example.com/sched-thumb.jpg",
            title: "Scheduled Transferred Video",
            sourceUrl: "https://example.com/watch?v=sched",
            quality: "720p",
            format: "mp4",
            fileSize: 2048,
            downloadedSize: 0,
            speed: 0,
            eta: "--",
            progress: 0,
            status: "queued",
            order: 1,
            addedAt: new Date().toISOString(),
            phaseStartedAt: Date.now(),
            lastUpdatedAt: Date.now(),
            retryCount: 0
          }
        ]
      }));
    });

    expect(await screen.findByText("Scheduled Transferred Video")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No downloads yet" })).not.toBeInTheDocument();
  });
});
