import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AnalysisResult, VideoMetadata } from "../types/download";
import { formatBytes } from "../utils/format";
import { getYouTubeThumbnailFallback } from "../utils/thumbnail";
import { quickAddSchema, type QuickAddFormValues } from "../utils/urlValidation";
import { useMetadataStore } from "../stores/metadataStore";
import { useQueueStore } from "../stores/queueStore";
import { useSettingsStore } from "../stores/settingsStore";

export function DashboardPage() {
  const { t } = useTranslation();
  const analyze = useMetadataStore((state) => state.analyze);
  const result = useMetadataStore((state) => state.result);
  const error = useMetadataStore((state) => state.error);
  const isAnalyzing = useMetadataStore((state) => state.isAnalyzing);
  const clearMetadata = useMetadataStore((state) => state.clear);
  const addFromMetadata = useQueueStore((state) => state.addFromMetadata);
  const addManyFromMetadata = useQueueStore((state) => state.addManyFromMetadata);
  const settings = useSettingsStore((state) => state.settings);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedQuality, setSelectedQuality] = useState(settings.defaultQuality);
  const [selectedFormat, setSelectedFormat] = useState(settings.defaultVideoFormat);

  useEffect(() => {
    if (!result || result.linkType === "playlist" || result.linkType === "channel") {
      return;
    }

    const validVideoFormats = ["mp4", "mp3", "webm", "mkv"];
    const normalizedFormats = Array.from(
      new Set([
        ...validVideoFormats.filter((format) => result.videoFormats.includes(format) || format === "mp3"),
        ...result.videoFormats.filter((format) => !["mhtml", "m4a"].includes(format))
      ])
    );

    const nextQuality = result.qualityOptions.includes(settings.defaultQuality)
      ? settings.defaultQuality
      : result.qualityOptions[0] ?? settings.defaultQuality;
    const fallbackFormat = normalizedFormats[0] ?? "mp4";
    const nextFormat = normalizedFormats.includes(settings.defaultVideoFormat)
      ? settings.defaultVideoFormat
      : fallbackFormat;

    setSelectedQuality(nextQuality);
    setSelectedFormat(nextFormat);
  }, [result, settings.defaultQuality, settings.defaultVideoFormat]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    resetField,
    formState: { errors }
  } = useForm<QuickAddFormValues>({
    defaultValues: {
      url: ""
    }
  });

  const watchedUrl = watch("url");
  const lastAutoAnalyzedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const nextUrl = watchedUrl?.trim() ?? "";
    if (!nextUrl) {
      return;
    }

    const validation = quickAddSchema.safeParse({ url: nextUrl });
    if (!validation.success) {
      return;
    }

    if (lastAutoAnalyzedUrlRef.current === nextUrl) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastAutoAnalyzedUrlRef.current = nextUrl;
      void onSubmit({ url: nextUrl });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [watchedUrl]);

  const selectableVideos = useMemo(() => {
    if (!result) {
      return [];
    }

    if (result.linkType === "playlist") {
      return result.videos;
    }

    if (result.linkType === "channel") {
      return result.latestVideos;
    }

    return [];
  }, [result]);

  async function onSubmit(values: QuickAddFormValues) {
    const analyzed = await analyze(values.url);
    if (analyzed?.linkType === "playlist") {
      setSelectedIds(analyzed.videos.map((video) => video.id));
    } else if (analyzed?.linkType === "channel") {
      setSelectedIds(analyzed.latestVideos.map((video) => video.id));
    } else {
      setSelectedIds([]);
    }
  }

  function addSingle(video: VideoMetadata, quality = selectedQuality, format = selectedFormat) {
    addFromMetadata(video, quality, format);
    toast.success(t("toast.addedToQueue"));
  }

  function addSelected() {
    const videos = selectableVideos.filter((video) => selectedIds.includes(video.id));
    addManyFromMetadata(videos, settings.defaultQuality, settings.defaultVideoFormat);
    toast.success(t("toast.addedManyToQueue", { count: videos.length }));
  }

  function addAll() {
    addManyFromMetadata(selectableVideos, settings.defaultQuality, settings.defaultVideoFormat);
    toast.success(t("toast.addedManyToQueue", { count: selectableVideos.length }));
  }

  function toggleSelected(videoId: string) {
    setSelectedIds((current) =>
      current.includes(videoId) ? current.filter((id) => id !== videoId) : [...current, videoId]
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          {t("dashboard.subtitle")}
        </p>
        <form className="mt-6 flex flex-col gap-3 lg:flex-row" onSubmit={handleSubmit(onSubmit)}>
          <div className="min-w-0 flex-1">
            <label htmlFor="quick-url" className="text-sm font-medium">
              {t("dashboard.urlLabel")}
            </label>
            <div className="relative mt-2">
              <input
                id="quick-url"
                type="url"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                placeholder={t("dashboard.urlPlaceholder")}
                aria-invalid={errors.url ? "true" : "false"}
                {...register("url", {
                  validate: (value) => {
                    const result = quickAddSchema.safeParse({ url: value });
                    return result.success || result.error.issues[0]?.message || "validation.invalidUrl";
                  }
                })}
              />
              {watchedUrl ? (
                <button
                  type="button"
                  aria-label={t("dashboard.clearUrl") || "Clear URL"}
                  title={t("dashboard.clearUrl") || "Clear URL"}
                  onClick={() => {
                    resetField("url");
                    setValue("url", "", { shouldValidate: true, shouldDirty: true });
                  }}
                  className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              ) : null}
            </div>
            {errors.url ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{t(errors.url.message ?? "")}</p>
            ) : null}
            {error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{t(error.message)}</p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={isAnalyzing}
            className="mt-7 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isAnalyzing ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : <Plus aria-hidden="true" size={18} />}
            {isAnalyzing ? t("dashboard.analyzing") : t("dashboard.analyze")}
          </button>
        </form>
      </div>

      {isAnalyzing ? <DashboardSkeleton /> : null}
      {result && !isAnalyzing ? (
        <AnalysisPanel
          result={result}
          selectedIds={selectedIds}
          selectedQuality={selectedQuality}
          selectedFormat={selectedFormat}
          onToggleSelected={toggleSelected}
          onSelectAll={() => setSelectedIds(selectableVideos.map((video) => video.id))}
          onDeselectAll={() => setSelectedIds([])}
          onAddSingle={addSingle}
          onAddSelected={addSelected}
          onAddAll={addAll}
          onQualityChange={setSelectedQuality}
          onFormatChange={setSelectedFormat}
          onClearResult={() => {
            resetField("url");
            setValue("url", "", { shouldValidate: true, shouldDirty: true });
            clearMetadata();
          }}
        />
      ) : null}
    </section>
  );
}

interface AnalysisPanelProps {
  result: AnalysisResult;
  selectedIds: string[];
  selectedQuality: string;
  selectedFormat: string;
  onToggleSelected: (videoId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAddSingle: (video: VideoMetadata, quality?: string, format?: string) => void;
  onAddSelected: () => void;
  onAddAll: () => void;
  onQualityChange: (quality: string) => void;
  onFormatChange: (format: string) => void;
  onClearResult: () => void;
}

function AnalysisPanel({
  result,
  selectedIds,
  selectedQuality,
  selectedFormat,
  onToggleSelected,
  onSelectAll,
  onDeselectAll,
  onAddSingle,
  onAddSelected,
  onAddAll,
  onQualityChange,
  onFormatChange,
  onClearResult
}: AnalysisPanelProps) {
  const { t } = useTranslation();

  if (result.linkType === "playlist") {
    return (
      <SelectableResult
        title={result.title}
        thumbnail={result.thumbnail}
        notice={t("dashboard.playlistNotice")}
        videos={result.videos}
        selectedIds={selectedIds}
        onToggleSelected={onToggleSelected}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
        onAddSelected={onAddSelected}
        onAddAll={onAddAll}
        showAddAll
      />
    );
  }

  if (result.linkType === "channel") {
    return (
      <SelectableResult
        title={`${result.name} (${result.mockVideoCount})`}
        thumbnail={result.thumbnail}
        notice={t("dashboard.channelNotice")}
        videos={result.latestVideos}
        selectedIds={selectedIds}
        onToggleSelected={onToggleSelected}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
        onAddSelected={onAddSelected}
        onAddAll={onAddAll}
        showAddAll={false}
      />
    );
  }

  const validVideoFormats = ["mp4", "mp3", "webm", "mkv"];
  const normalizedVideoFormats = Array.from(
    new Set([
      ...validVideoFormats.filter((format) => result.videoFormats.includes(format) || format === "mp3"),
      ...result.videoFormats.filter((format) => !["mhtml", "m4a"].includes(format))
    ])
  );

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex gap-4">
        <img
          className="aspect-video w-48 rounded-md object-cover"
          src={result.thumbnail || getYouTubeThumbnailFallback(result.sourceUrl) || ""}
          alt=""
          onError={(event) => {
            const fallback = getYouTubeThumbnailFallback(result.sourceUrl);
            if (fallback && event.currentTarget.src !== fallback) {
              event.currentTarget.src = fallback;
            } else {
              event.currentTarget.onerror = null;
            }
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase text-brand-700 dark:text-brand-50">
            {t("dashboard.detected")}: {result.linkType}
          </p>
          <h2 className="mt-1 text-xl font-semibold">{result.title}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{result.channelName}</p>
          {result.linkType === "playlist-video" ? (
            <p className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-slate-800 dark:text-brand-50">
              {t("dashboard.playlistVideoNotice")}
            </p>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              <span className="mb-2 block">Quality</span>
              <select
                value={selectedQuality}
                onChange={(event) => onQualityChange(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              >
                {(result.qualityOptions.length ? result.qualityOptions : [selectedQuality]).map((quality) => (
                  <option key={quality} value={quality}>
                    {quality}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              <span className="mb-2 block">Format</span>
              <select
                value={selectedFormat}
                onChange={(event) => onFormatChange(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              >
                {(normalizedVideoFormats.length ? normalizedVideoFormats : [selectedFormat]).map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => onAddSingle(result, selectedQuality, selectedFormat)}
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Check aria-hidden="true" size={18} />
              {t("dashboard.addToQueue")}
            </button>
            <button
              type="button"
              aria-label={t("dashboard.clearResult") || "Clear"}
              title={t("dashboard.clearResult") || "Clear"}
              onClick={onClearResult}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            >
              <Trash2 aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

interface SelectableResultProps {
  title: string;
  thumbnail: string;
  notice: string;
  videos: VideoMetadata[];
  selectedIds: string[];
  onToggleSelected: (videoId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAddSelected: () => void;
  onAddAll: () => void;
  showAddAll: boolean;
}

function SelectableResult({
  title,
  thumbnail,
  notice,
  videos,
  selectedIds,
  onToggleSelected,
  onSelectAll,
  onDeselectAll,
  onAddSelected,
  onAddAll,
  showAddAll
}: SelectableResultProps) {
  const { t } = useTranslation();

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-4">
        <img
          className="h-28 w-40 rounded-md object-cover"
          src={thumbnail || getYouTubeThumbnailFallback(videos[0]?.sourceUrl ?? "") || ""}
          alt=""
          onError={(event) => {
            const fallback = getYouTubeThumbnailFallback(videos[0]?.sourceUrl ?? "");
            if (fallback && event.currentTarget.src !== fallback) {
              event.currentTarget.src = fallback;
            } else {
              event.currentTarget.onerror = null;
            }
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase text-brand-700 dark:text-brand-50">
            {t("dashboard.detected")}
          </p>
          <h2 className="mt-1 text-xl font-semibold">{title}</h2>
          <p className="mt-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:bg-slate-800 dark:text-brand-50">
            {notice}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={onSelectAll}>
          {t("dashboard.selectAll")}
        </button>
        <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700" onClick={onDeselectAll}>
          {t("dashboard.deselectAll")}
        </button>
        <button
          type="button"
          disabled={selectedIds.length === 0}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={onAddSelected}
        >
          {t("dashboard.addSelected")}
        </button>
        {showAddAll ? (
          <button type="button" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-slate-700" onClick={onAddAll}>
            {t("dashboard.downloadEntirePlaylist")}
          </button>
        ) : null}
      </div>
      <div className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {videos.map((video) => (
          <label key={video.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800">
            <input
              type="checkbox"
              checked={selectedIds.includes(video.id)}
              onChange={() => onToggleSelected(video.id)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            <img
              className="aspect-video w-24 rounded object-cover"
              src={video.thumbnail || getYouTubeThumbnailFallback(video.sourceUrl) || ""}
              alt=""
              onError={(event) => {
                const fallback = getYouTubeThumbnailFallback(video.sourceUrl);
                if (fallback && event.currentTarget.src !== fallback) {
                  event.currentTarget.src = fallback;
                } else {
                  event.currentTarget.onerror = null;
                }
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{video.title}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {video.duration} · {formatBytes(video.fileSize)}
              </span>
            </span>
          </label>
        ))}
      </div>
    </article>
  );
}

function VideoInfo({ video }: { video: VideoMetadata }) {
  const details = [
    ["Resolution", video.resolution],
    ["FPS", String(video.fps)],
    ["Video Codec", video.videoCodec],
    ["Audio Codec", video.audioCodec],
    ["Video Bitrate", video.videoBitrate],
    ["Audio Bitrate", video.audioBitrate],
    ["Container", video.container],
    ["File Size", formatBytes(video.fileSize)],
    ["Upload Date", video.uploadDate],
    ["Views", new Intl.NumberFormat().format(video.views)]
  ];

  return (
    <dl className="mt-4 space-y-3">
      {details.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DashboardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-live="polite">
      <div className="flex animate-pulse gap-4">
        <div className="h-28 w-44 rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-7 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  );
}
