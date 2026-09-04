import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import "../i18n";
import i18n from "../i18n";
import { useDevToolsStore } from "../stores/devToolsStore";
import { useQueueStore } from "../stores/queueStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { VideoMetadata } from "../types/download";
import { DevToolsPanel } from "./DevToolsPanel";

const metadata: VideoMetadata = {
  id: "dev-test-video",
  sourceUrl: "https://www.youtube.com/watch?v=dev-test",
  linkType: "video",
  thumbnail: "https://example.com/thumb.jpg",
  title: "Dev Test Video",
  channelName: "Dev Channel",
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

describe("DevToolsPanel", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    document.documentElement.dir = "ltr";
    window.localStorage.clear();
    useDevToolsStore.getState().reset();
    useQueueStore.getState().clear();
    useSettingsStore.getState().resetSettings();
  });

  it("opens with Ctrl+Shift+D and renders the required controls", async () => {
    const user = userEvent.setup();
    render(<DevToolsPanel />);

    expect(screen.queryByRole("complementary", { name: "Dev Tools" })).not.toBeInTheDocument();

    await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}");

    expect(screen.getByRole("complementary", { name: "Dev Tools" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Scenario")).toBeInTheDocument();
    expect(screen.getByLabelText("Simulation Speed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seed Demo Data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear Mock Data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulate Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulate Error" })).toBeDisabled();
  });

  it("lists only the SPEC-defined mock scenario options", () => {
    useDevToolsStore.getState().openPanel();
    render(<DevToolsPanel />);

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Success",
      "Network Error",
      "Video Unavailable",
      "Disk Full",
      "Permission Denied",
      "yt-dlp Error",
      "FFmpeg Error",
      "0.5x",
      "1x",
      "2x",
      "4x"
    ]);
  });

  it("updates Dev Tools state and adds queued mock downloads without auto-starting them", async () => {
    const user = userEvent.setup();
    useDevToolsStore.getState().openPanel();
    render(<DevToolsPanel />);

    await user.selectOptions(screen.getByLabelText("Simulation Speed"), "4");
    expect(useDevToolsStore.getState().simulationSpeed).toBe(4);

    await user.click(screen.getByRole("button", { name: "Simulate Download" }));
    expect(useQueueStore.getState().items).toHaveLength(1);
    expect(useQueueStore.getState().items[0]?.status).toBe("queued");

    await user.click(screen.getByRole("button", { name: "Seed Demo Data" }));
    expect(useQueueStore.getState().items).toHaveLength(4);
    expect(useQueueStore.getState().items.every((item) => item.status === "queued")).toBe(true);
  });

  it("simulates the selected error only for eligible active mock downloads", async () => {
    const user = userEvent.setup();
    const item = useQueueStore.getState().addFromMetadata(metadata, "1080p", "mp4");
    useQueueStore.getState().tick(1, "unlimited", 1000);
    useDevToolsStore.getState().openPanel();

    render(<DevToolsPanel />);

    await user.selectOptions(screen.getByLabelText("Mock Scenario"), "disk_full");
    await user.click(screen.getByRole("button", { name: "Simulate Error" }));

    expect(useQueueStore.getState().items.find((queueItem) => queueItem.id === item.id)).toMatchObject({
      status: "failed",
      errorCode: "disk_full"
    });
  });

  it("does not apply error scenarios to queued items", async () => {
    const user = userEvent.setup();
    const item = useQueueStore.getState().addFromMetadata(metadata, "1080p", "mp4");
    useDevToolsStore.getState().setMockScenario("network_error");
    useDevToolsStore.getState().openPanel();

    render(<DevToolsPanel />);

    expect(screen.getByRole("button", { name: "Simulate Error" })).toBeDisabled();
    expect(useQueueStore.getState().items.find((queueItem) => queueItem.id === item.id)?.status).toBe("queued");
  });

  it("clears mock data without changing reset settings behavior", async () => {
    const user = userEvent.setup();
    useQueueStore.getState().addFromMetadata(metadata, "1080p", "mp4");
    useSettingsStore.getState().updateSettings({ concurrentDownloads: 5 });
    useDevToolsStore.getState().openPanel();

    render(<DevToolsPanel />);

    await user.click(screen.getByRole("button", { name: "Clear Mock Data" }));
    await waitFor(() => expect(useQueueStore.getState().items).toHaveLength(0));
    expect(useSettingsStore.getState().settings.concurrentDownloads).toBe(5);

    await user.click(screen.getByRole("button", { name: "Reset Settings" }));
    expect(useSettingsStore.getState().settings.concurrentDownloads).toBe(3);
  });
});
