import { create } from "zustand";

export type MockScenario =
  | "success"
  | "network_error"
  | "video_unavailable"
  | "disk_full"
  | "permission_denied"
  | "ytdlp_error"
  | "ffmpeg_error";

export const MOCK_SCENARIOS: readonly MockScenario[] = [
  "success",
  "network_error",
  "video_unavailable",
  "disk_full",
  "permission_denied",
  "ytdlp_error",
  "ffmpeg_error"
] as const;

interface DevToolsState {
  mockScenario: MockScenario;
  simulationSpeed: number;
  isPanelOpen: boolean;
  setMockScenario: (scenario: MockScenario) => void;
  setSimulationSpeed: (speed: number) => void;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  reset: () => void;
}

function normalizeSimulationSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) {
    return 1;
  }

  return speed;
}

export const useDevToolsStore = create<DevToolsState>((set) => ({
  mockScenario: "success",
  simulationSpeed: 1,
  isPanelOpen: false,
  setMockScenario: (mockScenario) => set({ mockScenario }),
  setSimulationSpeed: (simulationSpeed) => set({ simulationSpeed: normalizeSimulationSpeed(simulationSpeed) }),
  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false }),
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  reset: () => set({ mockScenario: "success", simulationSpeed: 1, isPanelOpen: false })
}));
