import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import "../i18n";
import { useQueueStore } from "../stores/queueStore";
import { useSchedulerStore } from "../stores/schedulerStore";
import { SchedulerPage } from "./SchedulerPage";

describe("SchedulerPage", () => {
  beforeEach(async () => {
    await useSchedulerStore.getState().resetForTests();
    useQueueStore.getState().clear();
  });

  it("renders a loading state while scheduled downloads are fetched", () => {
    const originalLoad = useSchedulerStore.getState().load;
    useSchedulerStore.setState({ isLoading: true, load: async () => undefined });

    const { unmount } = render(<SchedulerPage />);

    expect(screen.getByLabelText("Loading scheduled downloads")).toBeInTheDocument();
    unmount();
    useSchedulerStore.setState({ load: originalLoad, isLoading: false });
  });

  it("renders an accessible empty state", async () => {
    render(<SchedulerPage />);

    expect(await screen.findByText("No scheduled downloads")).toBeInTheDocument();
    expect(screen.getByText("Create a schedule to add a YouTube link to the queue when its time arrives.")).toBeInTheDocument();
  });

  it("validates required form fields", async () => {
    const user = userEvent.setup();
    render(<SchedulerPage />);

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Enter a YouTube URL.")).toBeInTheDocument();
  });

  it("creates, triggers, cancels, and removes scheduled downloads", async () => {
    const user = userEvent.setup();
    render(<SchedulerPage />);

    await user.type(screen.getByLabelText("YouTube URL"), "https://www.youtube.com/watch?v=scheduled-page");
    await user.clear(screen.getByLabelText("Date"));
    await user.type(screen.getByLabelText("Date"), "2026-08-14");
    await user.clear(screen.getByLabelText("Time"));
    await user.type(screen.getByLabelText("Time"), "10:00");
    await user.click(screen.getByRole("button", { name: "Create" }));

    const row = await screen.findByRole("listitem");
    expect(within(row).getByText(/scheduled-page/)).toBeInTheDocument();

    const schedule = useSchedulerStore.getState().items[0];
    await act(async () => {
      await useSchedulerStore.getState().tick(new Date(schedule?.nextRunAt ?? "").getTime());
    });

    expect(useQueueStore.getState().items[0]).toMatchObject({
      sourceUrl: "https://www.youtube.com/watch?v=scheduled-page",
      status: "queued"
    });

    await waitFor(() => expect(screen.getByText("Triggered")).toBeInTheDocument());
    expect(within(row).getByRole("button", { name: "Cancel" })).toBeDisabled();

    await user.click(within(row).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("listitem")).not.toBeInTheDocument());
    expect(await screen.findByText("No scheduled downloads")).toBeInTheDocument();
  });
});
