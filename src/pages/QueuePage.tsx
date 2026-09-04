import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { AlertTriangle, FolderOpen, GripVertical, Pause, Play, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CONCURRENT_DOWNLOAD_OPTIONS, SPEED_LIMIT_OPTIONS } from "../constants/download";
import { useDevToolsStore } from "../stores/devToolsStore";
import { useQueueStore, getQueueSummary } from "../stores/queueStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { DownloadItem, DownloadStatus } from "../types/download";
import { MOCK_ERROR_CODES, type AppErrorCode } from "../types/errors";
import { formatBytes } from "../utils/format";
import { getYouTubeThumbnailFallback } from "../utils/thumbnail";

const statusTone: Record<DownloadStatus, string> = {
  queued: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  analyzing: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
  downloading: "bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-50",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  merging: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
  converting: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
  canceled: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  retrying: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200"
};

export function QueuePage() {
  const { t } = useTranslation();
  const items = useQueueStore((state) => state.items);
  const load = useQueueStore((state) => state.load);
  const tick = useQueueStore((state) => state.tick);
  const reorder = useQueueStore((state) => state.reorder);
  const lastError = useQueueStore((state) => state.lastError);
  const clearLastError = useQueueStore((state) => state.clearLastError);
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const devSimulationSpeed = useDevToolsStore((state) => state.simulationSpeed);
  const simulationSpeed = import.meta.env.DEV ? devSimulationSpeed : 1;
  const summary = getQueueSummary(items);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      tick(settings.concurrentDownloads, settings.speedLimit, Date.now());
    }, Math.max(700, 1000 / simulationSpeed));

    return () => window.clearInterval(intervalId);
  }, [settings.concurrentDownloads, settings.speedLimit, simulationSpeed, tick]);

  useEffect(() => {
    if (lastError) {
      toast.error(t(lastError.message));
      clearLastError();
    }
  }, [clearLastError, lastError, t]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    reorder(String(active.id), String(over.id));
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("queue.title")}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t("queue.summary", {
              total: summary.total,
              active: summary.active,
              completed: summary.completed
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-medium">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">{t("queue.concurrent")}</span>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              value={settings.concurrentDownloads}
              onChange={(event) =>
                updateSettings({ concurrentDownloads: Number(event.target.value) as typeof settings.concurrentDownloads })
              }
            >
              {CONCURRENT_DOWNLOAD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">{t("queue.speedLimit")}</span>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              value={settings.speedLimit}
              onChange={(event) =>
                updateSettings({
                  speedLimit:
                    event.target.value === "unlimited" ? "unlimited" : Number(event.target.value)
                })
              }
            >
              {SPEED_LIMIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">{t("queue.emptyTitle")}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("queue.emptyDescription")}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3" role="list" aria-label={t("queue.title")}>
              {items.map((item) => (
                <QueueRow key={item.id} item={item} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function QueueRow({ item }: { item: DownloadItem }) {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const pause = useQueueStore((state) => state.pause);
  const resume = useQueueStore((state) => state.resume);
  const cancel = useQueueStore((state) => state.cancel);
  const retry = useQueueStore((state) => state.retry);
  const remove = useQueueStore((state) => state.remove);
  const simulateError = useQueueStore((state) => state.simulateError);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition
  };

  const canPause = item.status === "downloading";
  const canResume = item.status === "paused";
  const canCancel = ["queued", "analyzing", "downloading", "paused", "merging", "converting"].includes(item.status);
  const canRetry = item.status === "failed" || item.status === "canceled";
  const canSimulateError = ["analyzing", "downloading", "paused", "merging", "converting"].includes(item.status);

  return (
    <article
      ref={setNodeRef}
      style={style}
      role="listitem"
      className={[
        "rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900",
        isDragging ? "relative z-10 ring-2 ring-brand-500" : ""
      ].join(" ")}
    >
      <div className="grid gap-4 lg:grid-cols-[32px_120px_minmax(0,1fr)_220px] lg:items-center">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label={t("queue.reorder", { title: item.title })}
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" size={18} />
        </button>
        <img
          className="aspect-video w-full rounded-md object-cover lg:w-[120px]"
          src={item.thumbnail || getYouTubeThumbnailFallback(item.sourceUrl) || ""}
          alt=""
          onError={(event) => {
            const fallback = getYouTubeThumbnailFallback(item.sourceUrl);
            if (fallback && event.currentTarget.src !== fallback) {
              event.currentTarget.src = fallback;
            } else {
              event.currentTarget.onerror = null;
            }
          }}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold">{item.title}</h2>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone[item.status]}`}>
              {t(`queue.status.${item.status}`)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{item.sourceUrl}</p>
          <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-4">
            <span>{t("queue.quality")}: {item.quality}</span>
            <span>{t("queue.format")}: {item.format}</span>
            <span>{t("queue.size")}: {formatBytes(item.fileSize)}</span>
            <span>{t("queue.downloaded")}: {formatBytes(item.downloadedSize)}</span>
            <span>{t("queue.speed")}: {item.speed > 0 ? `${formatBytes(item.speed)}/s` : "--"}</span>
            <span>{t("queue.eta")}: {item.eta}</span>
          </div>
          <div className="mt-3">
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
              role="progressbar"
              aria-valuenow={Math.round(item.progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${Math.round(item.progress)}%`}
              aria-label={t("queue.progressFor", { title: item.title })}
            >
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${item.progress}%` }} />
            </div>
          </div>
          {item.errorMessage ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle aria-hidden="true" size={16} />
              {t(item.errorMessage)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
          <IconButton
            label={t("queue.openFolder")}
            onClick={async () => {
              if (typeof window !== "undefined" && window.electronAPI?.download?.openFolder) {
                await window.electronAPI.download.openFolder(settings.downloadFolder);
                return;
              }
              toast.info(t("history.toast.openFolderMock"));
            }}
            icon={<FolderOpen size={16} />}
          />
          <IconButton label={t("queue.pause")} disabled={!canPause} onClick={() => pause(item.id)} icon={<Pause size={16} />} />
          <IconButton label={t("queue.resume")} disabled={!canResume} onClick={() => resume(item.id)} icon={<Play size={16} />} />
          <IconButton label={t("queue.cancel")} disabled={!canCancel} onClick={() => cancel(item.id)} icon={<XCircle size={16} />} />
          <IconButton label={t("queue.retry")} disabled={!canRetry} onClick={() => retry(item.id)} icon={<RotateCcw size={16} />} />
          <IconButton label={t("queue.remove")} onClick={() => remove(item.id)} icon={<Trash2 size={16} />} />
        </div>
      </div>
    </article>
  );
}

interface IconButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
}

function IconButton({ label, disabled = false, onClick, icon }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {icon}
    </button>
  );
}

interface MockErrorControlProps {
  disabled: boolean;
  onSimulate: (code: AppErrorCode) => void;
  title: string;
}

function MockErrorControl({ disabled, onSimulate, title }: MockErrorControlProps) {
  const { t } = useTranslation();
  const selectId = `mock-error-${title.replace(/\W+/g, "-")}`;

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        onSimulate(String(formData.get("errorCode")) as AppErrorCode);
      }}
    >
      <label htmlFor={selectId} className="sr-only">
        {t("queue.mockError")}
      </label>
      <select
        id={selectId}
        name="errorCode"
        disabled={disabled}
        className="h-9 max-w-32 rounded-md border border-slate-300 bg-white px-2 text-xs disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950"
      >
        {MOCK_ERROR_CODES.map((code) => (
          <option key={code} value={code}>
            {t(`queue.errorLabels.${code}`)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={disabled}
        className="h-9 rounded-md border border-slate-300 px-2 text-xs font-medium disabled:opacity-40 dark:border-slate-700"
      >
        {t("queue.fail")}
      </button>
    </form>
  );
}
