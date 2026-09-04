import { describe, expect, it } from "vitest";
import type { DownloadStatus } from "../types/download";
import { ALL_DOWNLOAD_STATUSES, canTransition } from "./stateMachine";

const allowedPairs: readonly [DownloadStatus, DownloadStatus][] = [
  ["queued", "analyzing"],
  ["queued", "canceled"],
  ["analyzing", "downloading"],
  ["analyzing", "failed"],
  ["analyzing", "canceled"],
  ["downloading", "paused"],
  ["downloading", "merging"],
  ["downloading", "completed"],
  ["downloading", "failed"],
  ["downloading", "canceled"],
  ["paused", "downloading"],
  ["paused", "canceled"],
  ["paused", "failed"],
  ["merging", "converting"],
  ["merging", "failed"],
  ["merging", "canceled"],
  ["converting", "completed"],
  ["converting", "failed"],
  ["converting", "canceled"],
  ["failed", "retrying"],
  ["retrying", "analyzing"],
  ["retrying", "downloading"],
  ["canceled", "retrying"]
];

describe("state machine", () => {
  it("allows every specified transition", () => {
    for (const [from, to] of allowedPairs) {
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
    }
  });

  it("forbids every unspecified transition", () => {
    const allowedKeys = new Set(allowedPairs.map(([from, to]) => `${from}:${to}`));

    for (const from of ALL_DOWNLOAD_STATUSES) {
      for (const to of ALL_DOWNLOAD_STATUSES) {
        if (!allowedKeys.has(`${from}:${to}`)) {
          expect(canTransition(from, to), `${from} -> ${to}`).toBe(false);
        }
      }
    }
  });
});
