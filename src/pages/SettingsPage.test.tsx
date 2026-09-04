import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { DEFAULT_SETTINGS } from "../constants/settings";
import { useSettingsStore } from "../stores/settingsStore";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSettingsStore.getState().resetSettings();
  });

  it("renders all required settings sections", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Downloads" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clipboard" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Advanced" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Smart file naming" })).toBeInTheDocument();
  });

  it("updates persisted general and download settings", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.clear(screen.getByLabelText("Download folder"));
    await user.type(screen.getByLabelText("Download folder"), "D:/Media");
    await user.selectOptions(screen.getByLabelText("Concurrent downloads"), "5");
    await user.selectOptions(screen.getByLabelText("Speed limit"), String(1024 * 1024));
    await user.selectOptions(screen.getByLabelText("Default quality"), "720p");
    await user.selectOptions(screen.getByLabelText("Default video format"), "webm");
    await user.selectOptions(screen.getByLabelText("Default audio format"), "mp3");

    expect(useSettingsStore.getState().settings).toMatchObject({
      downloadFolder: "D:/Media",
      concurrentDownloads: 5,
      speedLimit: 1024 * 1024,
      defaultQuality: "720p",
      defaultVideoFormat: "webm",
      defaultAudioFormat: "mp3"
    });
    expect(JSON.parse(window.localStorage.getItem("remon-download-settings") ?? "{}")).toMatchObject({
      downloadFolder: "D:/Media",
      concurrentDownloads: 5
    });
  });

  it("updates theme, language, notifications, clipboard, and advanced settings", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "dark" } });
    await user.click(screen.getByLabelText("Enable notifications"));
    await user.click(screen.getByLabelText("Clipboard monitoring"));
    fireEvent.change(screen.getByLabelText("yt-dlp path"), { target: { value: "C:/tools/yt-dlp.exe" } });
    fireEvent.change(screen.getByLabelText("FFmpeg path"), { target: { value: "C:/tools/ffmpeg.exe" } });
    fireEvent.change(screen.getByLabelText("Proxy"), { target: { value: "http://localhost:8080" } });
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "ar" } });

    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(useSettingsStore.getState().settings).toMatchObject({
      language: "ar",
      appearance: "dark",
      enableNotifications: false,
      clipboardMonitoring: true,
      ytdlpPath: "C:/tools/yt-dlp.exe",
      ffmpegPath: "C:/tools/ffmpeg.exe",
      proxy: "http://localhost:8080"
    });
  });

  it("opens the native folder picker when Browse is clicked", async () => {
    const user = userEvent.setup();
    const selectDownloadFolder = vi.fn().mockResolvedValue("D:/Media");
    const previous = window.electronAPI;
    Object.defineProperty(window, "electronAPI", {
      value: {
        isElectron: true,
        settings: {
          get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, downloadFolder: "~/Downloads" }),
          update: vi.fn(async (patch) => ({ ...DEFAULT_SETTINGS, ...patch })),
          reset: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
          selectDownloadFolder
        }
      },
      configurable: true,
      writable: true
    });

    render(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: "Browse" }));

    expect(selectDownloadFolder).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().settings.downloadFolder).toBe("D:/Media");
    if (previous) {
      Object.defineProperty(window, "electronAPI", { value: previous, configurable: true, writable: true });
    } else {
      delete (window as { electronAPI?: unknown }).electronAPI;
    }
  });

  it("renders smart file naming preview and resets settings", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.selectOptions(screen.getByLabelText("Default quality"), "720p");
    await user.selectOptions(screen.getByLabelText("Default video format"), "mkv");

    expect(screen.getByText("Example Channel - Amazing Nature Documentary [720p].mkv")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset settings" }));

    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
    expect(screen.getByLabelText("Download folder")).toHaveValue("~/Downloads");
  });
});
