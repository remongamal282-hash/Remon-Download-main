import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_SCENARIOS, useDevToolsStore } from "./devToolsStore";

describe("useDevToolsStore", () => {
  beforeEach(() => {
    useDevToolsStore.getState().reset();
  });

  it("stores the SPEC-defined Dev Tools state", () => {
    expect(useDevToolsStore.getState()).toMatchObject({
      mockScenario: "success",
      simulationSpeed: 1,
      isPanelOpen: false
    });

    useDevToolsStore.getState().setMockScenario("disk_full");
    useDevToolsStore.getState().setSimulationSpeed(4);
    useDevToolsStore.getState().openPanel();

    expect(useDevToolsStore.getState()).toMatchObject({
      mockScenario: "disk_full",
      simulationSpeed: 4,
      isPanelOpen: true
    });
  });

  it("supports only the SPEC-defined mock scenarios", () => {
    expect(MOCK_SCENARIOS).toEqual([
      "success",
      "network_error",
      "video_unavailable",
      "disk_full",
      "permission_denied",
      "ytdlp_error",
      "ffmpeg_error"
    ]);
  });

  it("normalizes invalid simulation speeds without changing queue state", () => {
    useDevToolsStore.getState().setSimulationSpeed(0);
    expect(useDevToolsStore.getState().simulationSpeed).toBe(1);

    useDevToolsStore.getState().setSimulationSpeed(Number.NaN);
    expect(useDevToolsStore.getState().simulationSpeed).toBe(1);
  });

  it("toggles and resets panel state", () => {
    useDevToolsStore.getState().togglePanel();
    expect(useDevToolsStore.getState().isPanelOpen).toBe(true);

    useDevToolsStore.getState().reset();
    expect(useDevToolsStore.getState()).toMatchObject({
      mockScenario: "success",
      simulationSpeed: 1,
      isPanelOpen: false
    });
  });
});
