import { FolderOpen, RotateCcw, Star, Trash2 } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useHistoryStore } from "../stores/historyStore";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { HistoryItem, HistoryStatus } from "../types/download";
import { formatBytes } from "../utils/format";
import { getYouTubeThumbnailFallback } from "../utils/thumbnail";

const statusTone: Record<HistoryStatus, string> = {
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
  canceled: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
};

export function HistoryPage() {
  const { t } = useTranslation();
  const items = useHistoryStore((state) => state.items);
  const isLoading = useHistoryStore((state) => state.isLoading);
  const error = useHistoryStore((state) => state.error);
  const load = useHistoryStore((state) => state.load);
  const clearError = useHistoryStore((state) => state.clearError);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) {
      toast.error(t(error.message));
      clearError();
    }
  }, [clearError, error, t]);

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">{t("history.title")}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("history.summary", { count: items.length })}
        </p>
      </div>

      {isLoading ? <HistorySkeleton /> : null}

      {!isLoading && items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">{t("history.emptyTitle")}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("history.emptyDescription")}</p>
        </div>
      ) : null}

      {!isLoading && items.length > 0 ? (
        <div className="space-y-3" role="list" aria-label={t("history.title")}>
          {items.map((item) => (
            <HistoryRow key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const { t, i18n } = useTranslation();
  const remove = useHistoryStore((state) => state.remove);
  const redownload = useHistoryStore((state) => state.redownload);
  const openFolder = useHistoryStore((state) => state.openFolder);
  const settings = useSettingsStore((state) => state.settings);
  const addToFavorites = useFavoritesStore((state) => state.add);

  function handleRedownload() {
    if (redownload(item.id)) {
      toast.success(t("history.toast.redownloaded"));
    }
  }

  async function handleOpenFolder() {
    if (!openFolder(item.id)) {
      return;
    }

    if (typeof window !== "undefined" && window.electronAPI?.download?.openFolder) {
      try {
        await window.electronAPI.download.openFolder(settings.downloadFolder);
        return;
      } catch (error) {
        console.error("[HistoryPage] Failed to open download folder:", error);
      }
    }

    toast.info(t("history.toast.openFolderMock"));
  }

  async function handleAddToFavorites() {
    try {
      const newId = `fav-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      await addToFavorites({
        id: newId,
        sourceUrl: item.sourceUrl,
        title: item.title,
        thumbnail: item.thumbnail,
        channel: '', // History doesn't have channel info
        dateAdded: new Date().toISOString(),
      });
      toast.success(t("history.toast.addedToFavorites"));
    } catch (error) {
      toast.error(t("history.toast.addToFavoritesFailed"));
    }
  }

  return (
    <article
      role="listitem"
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="grid gap-4 lg:grid-cols-[120px_minmax(0,1fr)_180px] lg:items-center">
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
              {t(`history.status.${item.status}`)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{item.sourceUrl}</p>
          <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-5">
            <span>{t("history.date")}: {new Intl.DateTimeFormat(i18n.language).format(new Date(item.date))}</span>
            <span>{t("history.quality")}: {item.quality}</span>
            <span>{t("history.format")}: {item.format}</span>
            <span>{t("history.size")}: {formatBytes(item.fileSize)}</span>
            <span>{t("history.statusLabel")}: {t(`history.status.${item.status}`)}</span>
          </div>
          {item.errorMessage ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{t(item.errorMessage)}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
          <IconButton label={t("history.addToFavorites")} onClick={handleAddToFavorites} icon={<Star size={16} />} />
          <IconButton label={t("history.redownload")} onClick={handleRedownload} icon={<RotateCcw size={16} />} />
          <IconButton label={t("history.openFolder")} onClick={handleOpenFolder} icon={<FolderOpen size={16} />} />
          <IconButton label={t("history.remove")} onClick={() => void remove(item.id)} icon={<Trash2 size={16} />} />
        </div>
      </div>
    </article>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  icon: ReactNode;
}

function IconButton({ label, onClick, icon }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {icon}
    </button>
  );
}

function HistorySkeleton() {
  const { t } = useTranslation();

  return (
    <div className="space-y-3" aria-live="polite" aria-label={t("history.loading")}>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex animate-pulse gap-4">
            <div className="h-20 w-32 rounded-md bg-slate-200 dark:bg-slate-800" />
            <div className="flex-1 space-y-3">
              <div className="h-5 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
