import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import "../i18n";
import { HistoryPage } from "./HistoryPage";
import { useHistoryStore } from "../stores/historyStore";
import { useQueueStore } from "../stores/queueStore";
import type { DownloadItem } from "../types/download";

const baseDownload: DownloadItem = {
  id: "download-1",
  metadataId: "video-1",
  thumbnail: "https://example.com/thumb.jpg",
  title: "History Page Video",
  sourceUrl: "https://www.youtube.com/watch?v=history-page",
  quality: "1080p",
  format: "mp4",
  fileSize: 8192,
  downloadedSize: 8192,
  speed: 0,
  eta: "--",
  progress: 100,
  status: "completed",
  order: 1,
  addedAt: "2026-08-14T08:00:00.000Z",
  phaseStartedAt: 0,
  lastUpdatedAt: 0,
  retryCount: 0
};

describe("HistoryPage", () => {
  beforeEach(async () => {
    await useHistoryStore.getState().clear();
    useHistoryStore.getState().clearError();
    useQueueStore.getState().clear();
  });

  it("renders a loading state while history is fetched", async () => {
    const originalLoad = useHistoryStore.getState().load;
    useHistoryStore.setState({ isLoading: true, load: async () => undefined });

    const { unmount } = render(<HistoryPage />);

    expect(screen.getByLabelText("Loading history")).toBeInTheDocument();
    unmount();
    useHistoryStore.setState({ load: originalLoad, isLoading: false });
  });

  it("renders an accessible empty state", async () => {
    render(<HistoryPage />);

    expect(await screen.findByText("No history yet")).toBeInTheDocument();
    expect(screen.getByText("Completed, failed, and canceled downloads will appear here.")).toBeInTheDocument();
  });

  it("renders completed, failed, and canceled history rows", async () => {
    await useHistoryStore.getState().addFromDownload(baseDownload, "2026-08-14T08:10:00.000Z");
    await useHistoryStore.getState().addFromDownload(
      { ...baseDownload, id: "download-2", title: "Failed Video", status: "failed", errorMessage: "errors.networkError" },
      "2026-08-14T08:11:00.000Z"
    );
    await useHistoryStore.getState().addFromDownload(
      { ...baseDownload, id: "download-3", title: "Canceled Video", status: "canceled" },
      "2026-08-14T08:12:00.000Z"
    );

    render(<HistoryPage />);

    expect(await screen.findByText("History Page Video")).toBeInTheDocument();
    expect(screen.getByText("Failed Video")).toBeInTheDocument();
    expect(screen.getByText("Canceled Video")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Canceled").length).toBeGreaterThan(0);
  });

  it("supports re-download, real open folder, and remove interactions", async () => {
    await useHistoryStore.getState().addFromDownload(baseDownload, "2026-08-14T08:10:00.000Z");
    const user = userEvent.setup();
    const openFolder = vi.fn().mockResolvedValue(undefined);
    (window as any).electronAPI = {
      download: { openFolder }
    };
    await useHistoryStore.getState().clear();
    await useHistoryStore.getState().addFromDownload(baseDownload, "2026-08-14T08:10:00.000Z");

    render(<HistoryPage />);

    const row = await screen.findByRole("listitem");
    await user.click(within(row).getByRole("button", { name: "Re-download" }));
    expect(useQueueStore.getState().items[0]).toMatchObject({
      title: baseDownload.title,
      sourceUrl: baseDownload.sourceUrl,
      status: "queued"
    });

    await user.keyboard("{Tab}");
    await user.click(within(row).getByRole("button", { name: "Open Folder" }));
    await waitFor(() => expect(openFolder).toHaveBeenCalledWith("~/Downloads"));
    expect(useHistoryStore.getState().error).toBeNull();

    await user.click(within(row).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByText("History Page Video")).not.toBeInTheDocument());
    expect(await screen.findByText("No history yet")).toBeInTheDocument();
  });
});
