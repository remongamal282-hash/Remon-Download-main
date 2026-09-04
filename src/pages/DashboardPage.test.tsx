import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../i18n";
import i18n from "../i18n";
import { DashboardPage } from "./DashboardPage";
import { useMetadataStore } from "../stores/metadataStore";
import { useQueueStore } from "../stores/queueStore";

describe("DashboardPage", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    document.documentElement.dir = "ltr";
    useMetadataStore.setState({ result: null, error: null, isAnalyzing: false });
    useQueueStore.setState({ items: [] });
  });

  it("validates empty and invalid URLs", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    const submitBtn = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitBtn);

    expect(await screen.findByText(/enter a youtube url/i)).toBeInTheDocument();
  });

  it("analyzes a video URL and adds item to queue without starting download", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    const input = screen.getByRole("textbox", { name: /youtube url/i });
    await user.type(input, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(await screen.findByRole("heading", { name: "Amazing Nature Documentary" })).toBeInTheDocument();
    expect(screen.getByLabelText("Format")).toHaveValue("mp4");

    const addBtn = screen.getByRole("button", { name: /add to queue/i });
    await user.click(addBtn);

    const queueItems = useQueueStore.getState().items;
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0].status).toBe("queued");
  });

  it("auto-analyzes a valid URL and defaults to 720p + mp4", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    const input = screen.getByRole("textbox", { name: /youtube url/i });
    await user.type(input, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(await screen.findByRole("heading", { name: "Amazing Nature Documentary" })).toBeInTheDocument();
    expect(screen.getByLabelText("Quality")).toHaveValue("720p");
    expect(screen.getByLabelText("Format")).toHaveValue("mp4");
  });

  it("supports choosing a quality and format before adding a single video to the queue", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    const input = screen.getByRole("textbox", { name: /youtube url/i });
    await user.type(input, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(await screen.findByRole("heading", { name: "Amazing Nature Documentary" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Quality"), "720p");
    await user.selectOptions(screen.getByLabelText("Format"), "mp4");
    await user.click(screen.getByRole("button", { name: /add to queue/i }));

    const queueItems = useQueueStore.getState().items;
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0].quality).toBe("720p");
    expect(queueItems[0].format).toBe("mp4");
  });

  it("supports playlist selection and adding selected items to queue", async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    const input = screen.getByRole("textbox", { name: /youtube url/i });
    await user.type(input, "https://www.youtube.com/playlist?list=PL12345");

    expect(await screen.findByRole("heading", { name: "Creator Picks Playlist" })).toBeInTheDocument();

    const deselectBtn = screen.getByRole("button", { name: /deselect all/i });
    await user.click(deselectBtn);

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    const addSelectedBtn = screen.getByRole("button", { name: /add selected/i });
    await user.click(addSelectedBtn);

    const queueItems = useQueueStore.getState().items;
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0].status).toBe("queued");
  });
});
