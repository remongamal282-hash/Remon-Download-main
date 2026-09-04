import { AlertTriangle, Bug, Database, Download, Gauge, Play, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDevToolsStore, MOCK_SCENARIOS, type MockScenario } from "../stores/devToolsStore";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useHistoryStore } from "../stores/historyStore";
import { useMetadataStore } from "../stores/metadataStore";
import { useQueueStore } from "../stores/queueStore";
import { useSchedulerStore } from "../stores/schedulerStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { DownloadStatus, VideoMetadata } from "../types/download";

const SIMULATION_SPEED_OPTIONS = [0.5, 1, 2, 4] as const;
const errorableStatuses = ["analyzing", "downloading", "paused", "merging", "converting"] as const;
type ErrorMockScenario = Exclude<MockScenario, "success">;

function createDevToolsVideo(index: number): VideoMetadata {
  return {
    id: `dev-tools-video-${index}`,
    sourceUrl: `https://www.youtube.com/watch?v=dev-tools-${index}`,
    linkType: "video",
    thumbnail: `https://picsum.photos/seed/remon-dev-tools-${index}/320/180`,
    title: index === 1 ? "Dev Tools Simulation" : `Dev Tools Demo ${index}`,
    channelName: "Prototype Lab",
    duration: "08:24",
    views: 42000 + index * 1000,
    qualityOptions: ["2160p", "1440p", "1080p", "720p"],
    videoFormats: ["mp4", "webm", "mkv"],
    audioFormats: ["mp3", "opus"],
    resolution: "1080p",
    fps: 60,
    videoCodec: "H.264",
    audioCodec: "AAC",
    videoBitrate: "7.5 Mbps",
    audioBitrate: "192 Kbps",
    container: "mp4",
    fileSize: (160 + index * 25) * 1024 * 1024,
    uploadDate: "2026-08-01"
  };
}

function isErrorScenario(scenario: MockScenario): scenario is ErrorMockScenario {
  return scenario !== "success";
}

function isErrorableStatus(status: DownloadStatus): boolean {
  return errorableStatuses.includes(status as (typeof errorableStatuses)[number]);
}

export function DevToolsPanel() {
  const { t } = useTranslation();
  const mockScenario = useDevToolsStore((state) => state.mockScenario);
  const simulationSpeed = useDevToolsStore((state) => state.simulationSpeed);
  const isPanelOpen = useDevToolsStore((state) => state.isPanelOpen);
  const setMockScenario = useDevToolsStore((state) => state.setMockScenario);
  const setSimulationSpeed = useDevToolsStore((state) => state.setSimulationSpeed);
  const closePanel = useDevToolsStore((state) => state.closePanel);
  const togglePanel = useDevToolsStore((state) => state.togglePanel);
  const queueItems = useQueueStore((state) => state.items);
  const addFromMetadata = useQueueStore((state) => state.addFromMetadata);
  const addManyFromMetadata = useQueueStore((state) => state.addManyFromMetadata);
  const simulateError = useQueueStore((state) => state.simulateError);
  const clearQueue = useQueueStore((state) => state.clear);
  const clearMetadata = useMetadataStore((state) => state.clear);
  const clearHistory = useHistoryStore((state) => state.clear);
  const clearFavorites = useFavoritesStore((state) => state.clearMockData);
  const clearScheduler = useSchedulerStore((state) => state.clearMockData);
  const settings = useSettingsStore((state) => state.settings);
  const resetSettings = useSettingsStore((state) => state.resetSettings);

  const errorTarget = queueItems.find((item) => isErrorableStatus(item.status));
  const canSimulateError = Boolean(errorTarget && isErrorScenario(mockScenario));

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        togglePanel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePanel]);

  function handleSimulateDownload() {
    addFromMetadata(createDevToolsVideo(Date.now()), settings.defaultQuality, settings.defaultVideoFormat);
    toast.success(t("devTools.toast.simulatedDownload"));
  }

  function handleSeedDemoData() {
    addManyFromMetadata([1, 2, 3].map(createDevToolsVideo), settings.defaultQuality, settings.defaultVideoFormat);
    toast.success(t("devTools.toast.seeded"));
  }

  async function handleClearMockData() {
    clearQueue();
    clearMetadata();
    await clearHistory();
    await clearFavorites();
    await clearScheduler();
    toast.success(t("devTools.toast.cleared"));
  }

  function handleResetSettings() {
    resetSettings();
    toast.success(t("devTools.toast.settingsReset"));
  }

  function handleSimulateError() {
    if (!errorTarget || !isErrorScenario(mockScenario)) {
      return;
    }

    simulateError(errorTarget.id, mockScenario);
    toast.error(t("devTools.toast.errorSimulated"));
  }

  if (!isPanelOpen) {
    return null;
  }

  return (
    <aside
      className="fixed bottom-4 end-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      aria-label={t("devTools.title")}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white dark:bg-brand-600">
            <Bug aria-hidden="true" size={18} />
          </span>
          <div>
            <h2 className="text-base font-semibold">{t("devTools.title")}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("devTools.shortcut")}</p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label={t("devTools.close")}
          onClick={closePanel}
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      <div className="mt-4 grid gap-4">
        <label className="text-sm font-medium">
          <span className="mb-1 flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <AlertTriangle aria-hidden="true" size={16} />
            {t("devTools.mockScenario")}
          </span>
          <select
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            value={mockScenario}
            onChange={(event) => setMockScenario(event.target.value as MockScenario)}
          >
            {MOCK_SCENARIOS.map((scenario) => (
              <option key={scenario} value={scenario}>
                {t(`devTools.scenarios.${scenario}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium">
          <span className="mb-1 flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Gauge aria-hidden="true" size={16} />
            {t("devTools.simulationSpeed")}
          </span>
          <select
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            value={simulationSpeed}
            onChange={(event) => setSimulationSpeed(Number(event.target.value))}
          >
            {SIMULATION_SPEED_OPTIONS.map((speed) => (
              <option key={speed} value={speed}>
                {t("devTools.speedValue", { speed })}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <DevToolsButton icon={<Database size={16} />} label={t("devTools.seedDemoData")} onClick={handleSeedDemoData} />
          <DevToolsButton icon={<Trash2 size={16} />} label={t("devTools.clearMockData")} onClick={() => void handleClearMockData()} />
          <DevToolsButton icon={<RotateCcw size={16} />} label={t("devTools.resetSettings")} onClick={handleResetSettings} />
          <DevToolsButton icon={<Download size={16} />} label={t("devTools.simulateDownload")} onClick={handleSimulateDownload} />
          <DevToolsButton
            className="col-span-2"
            icon={<Play size={16} />}
            label={t("devTools.simulateError")}
            disabled={!canSimulateError}
            onClick={handleSimulateError}
          />
        </div>
      </div>
    </aside>
  );
}

interface DevToolsButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

function DevToolsButton({ icon, label, onClick, disabled = false, className = "" }: DevToolsButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800 ${className}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
