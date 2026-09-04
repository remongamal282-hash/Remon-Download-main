import { Download, Trash2 } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { FavoriteItem } from "../types/download";

export function FavoritesPage() {
  const { t } = useTranslation();
  const items = useFavoritesStore((state) => state.items);
  const isLoading = useFavoritesStore((state) => state.isLoading);
  const error = useFavoritesStore((state) => state.error);
  const load = useFavoritesStore((state) => state.load);
  const clearError = useFavoritesStore((state) => state.clearError);

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
        <h1 className="text-2xl font-semibold">{t("favorites.title")}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("favorites.summary", { count: items.length })}
        </p>
      </div>

      {isLoading ? <FavoritesSkeleton /> : null}

      {!isLoading && items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">{t("favorites.emptyTitle")}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("favorites.emptyDescription")}</p>
        </div>
      ) : null}

      {!isLoading && items.length > 0 ? (
        <div className="space-y-3" role="list" aria-label={t("favorites.title")}>
          {items.map((item) => (
            <FavoriteRow key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FavoriteRow({ item }: { item: FavoriteItem }) {
  const { t, i18n } = useTranslation();
  const remove = useFavoritesStore((state) => state.remove);
  const download = useFavoritesStore((state) => state.download);
  const settings = useSettingsStore((state) => state.settings);

  function handleDownload() {
    if (download(item.id, settings.defaultQuality, settings.defaultVideoFormat)) {
      toast.success(t("favorites.toast.downloadQueued"));
    }
  }

  return (
    <article
      role="listitem"
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="grid gap-4 lg:grid-cols-[120px_minmax(0,1fr)_120px] lg:items-center">
        <img className="aspect-video w-full rounded-md object-cover lg:w-[120px]" src={item.thumbnail} alt="" />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{item.title}</h2>
          <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">{item.channel}</p>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{item.sourceUrl}</p>
          <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
            {t("favorites.dateAdded")}: {new Intl.DateTimeFormat(i18n.language).format(new Date(item.dateAdded))}
          </p>
        </div>
        <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
          <IconButton label={t("favorites.download")} onClick={handleDownload} icon={<Download size={16} />} />
          <IconButton label={t("favorites.remove")} onClick={() => void remove(item.id)} icon={<Trash2 size={16} />} />
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900"
    >
      {icon}
    </button>
  );
}

function FavoritesSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="space-y-3" aria-live="polite" aria-label={t("favorites.loading")}>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex animate-pulse gap-4">
            <div className="h-20 w-32 rounded-md bg-slate-200 dark:bg-slate-800" />
            <div className="flex-1 space-y-3">
              <div className="h-5 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
