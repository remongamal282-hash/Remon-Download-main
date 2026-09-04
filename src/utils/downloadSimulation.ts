import type { SpeedLimit } from "../types/settings";

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "--";
  }

  const rounded = Math.ceil(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

export function calculateMockSpeed(bytesPerSecondBase: number, speedLimit: SpeedLimit, tickIndex: number): number {
  const wave = 0.78 + Math.sin(tickIndex * 0.73) * 0.14 + Math.cos(tickIndex * 0.31) * 0.08;
  const simulated = Math.max(64 * 1024, bytesPerSecondBase * wave);

  if (speedLimit === "unlimited") {
    return simulated;
  }

  return Math.min(simulated, speedLimit);
}
