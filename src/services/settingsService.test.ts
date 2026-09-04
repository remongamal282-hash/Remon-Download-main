import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../constants/settings";
import { LocalStorageSettingsService } from "./settingsService";

describe("LocalStorageSettingsService", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when no settings are stored", () => {
    const service = new LocalStorageSettingsService();

    expect(service.get()).toEqual(DEFAULT_SETTINGS);
  });

  it("persists updates to localStorage", () => {
    const service = new LocalStorageSettingsService();

    const settings = service.update({
      downloadFolder: "D:/Downloads",
      concurrentDownloads: 5,
      speedLimit: 1024 * 1024,
      defaultQuality: "720p",
      defaultVideoFormat: "webm",
      defaultAudioFormat: "mp3"
    });

    expect(settings).toMatchObject({
      downloadFolder: "D:/Downloads",
      concurrentDownloads: 5,
      speedLimit: 1024 * 1024,
      defaultQuality: "720p",
      defaultVideoFormat: "webm",
      defaultAudioFormat: "mp3"
    });
    expect(new LocalStorageSettingsService().get()).toMatchObject(settings);
  });

  it("recovers from corrupt stored settings", () => {
    window.localStorage.setItem("remon-download-settings", "{bad json");
    const service = new LocalStorageSettingsService();

    expect(service.get()).toEqual(DEFAULT_SETTINGS);
    expect(JSON.parse(window.localStorage.getItem("remon-download-settings") ?? "")).toEqual(DEFAULT_SETTINGS);
  });

  it("resets settings to defaults", () => {
    const service = new LocalStorageSettingsService();

    service.update({ language: "ar", appearance: "dark" });

    expect(service.reset()).toEqual(DEFAULT_SETTINGS);
    expect(service.get()).toEqual(DEFAULT_SETTINGS);
  });
});
