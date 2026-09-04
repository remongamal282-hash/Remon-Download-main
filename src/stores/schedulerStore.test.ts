import { beforeEach, describe, expect, it } from "vitest";
import { useQueueStore } from "./queueStore";
import { useSchedulerStore } from "./schedulerStore";

const scheduleInput = {
  sourceUrl: "https://www.youtube.com/watch?v=scheduled-store",
  date: "2026-08-14",
  time: "10:00",
  repeat: "once" as const
};

describe("useSchedulerStore", () => {
  beforeEach(async () => {
    await useSchedulerStore.getState().resetForTests();
    useQueueStore.getState().clear();
  });

  it("creates and loads scheduled downloads", async () => {
    await useSchedulerStore.getState().create(scheduleInput);
    useSchedulerStore.setState({ items: [] });

    await useSchedulerStore.getState().load();

    expect(useSchedulerStore.getState().items).toHaveLength(1);
    expect(useSchedulerStore.getState().isLoading).toBe(false);
  });

  it("triggers due schedules into the queue without starting them", async () => {
    const item = await useSchedulerStore.getState().create(scheduleInput);

    const triggeredCount = await useSchedulerStore.getState().tick(new Date(item?.nextRunAt ?? "").getTime());

    expect(triggeredCount).toBe(1);
    expect(useQueueStore.getState().items[0]).toMatchObject({
      sourceUrl: scheduleInput.sourceUrl,
      status: "queued",
      quality: "720p",
      format: "mp4"
    });
    expect(useSchedulerStore.getState().items[0]).toMatchObject({
      status: "triggered",
      triggerCount: 1
    });
  });

  it("adds a once-only scheduled item to the queue only once even if tick is called repeatedly", async () => {
    const item = await useSchedulerStore.getState().create(scheduleInput);

    const firstTick = await useSchedulerStore.getState().tick(new Date(item?.nextRunAt ?? "").getTime());
    const secondTick = await useSchedulerStore.getState().tick(new Date(item?.nextRunAt ?? "").getTime());

    expect(firstTick).toBe(1);
    expect(secondTick).toBe(0);
    expect(useQueueStore.getState().items).toHaveLength(1);
    expect(useQueueStore.getState().items[0]).toMatchObject({
      sourceUrl: scheduleInput.sourceUrl,
      status: "queued"
    });
  });

  it("ignores overlapping tick calls so a due item is not added to the queue multiple times", async () => {
    const item = await useSchedulerStore.getState().create(scheduleInput);
    const dueAt = new Date(item?.nextRunAt ?? "").getTime();

    await Promise.all([
      useSchedulerStore.getState().tick(dueAt),
      useSchedulerStore.getState().tick(dueAt)
    ]);

    expect(useQueueStore.getState().items).toHaveLength(1);
    expect(useQueueStore.getState().items[0]).toMatchObject({
      sourceUrl: scheduleInput.sourceUrl,
      status: "queued"
    });
  });

  it("updates, cancels, and removes schedules", async () => {
    const item = await useSchedulerStore.getState().create(scheduleInput);

    await useSchedulerStore.getState().update(item?.id ?? "", { ...scheduleInput, repeat: "weekly" });
    expect(useSchedulerStore.getState().items[0]?.repeat).toBe("weekly");

    await useSchedulerStore.getState().cancel(item?.id ?? "");
    expect(useSchedulerStore.getState().items[0]?.status).toBe("canceled");

    await useSchedulerStore.getState().remove(item?.id ?? "");
    expect(useSchedulerStore.getState().items).toEqual([]);
  });

  it("maps service errors into store error state", async () => {
    useSchedulerStore.getState().failNext({ code: "network_error", message: "errors.networkError", recoverable: true });

    await useSchedulerStore.getState().load();

    expect(useSchedulerStore.getState().error).toMatchObject({ code: "network_error" });
    expect(useSchedulerStore.getState().isLoading).toBe(false);
  });
});
