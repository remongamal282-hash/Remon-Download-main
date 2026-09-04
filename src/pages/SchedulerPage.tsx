import { AlertCircle, CalendarClock, CheckCircle2, Download, Plus, Trash2, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ROUTES } from "../constants/routes";
import { useMetadataStore } from "../stores/metadataStore";
import { useQueueStore } from "../stores/queueStore";
import { useSchedulerStore } from "../stores/schedulerStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { ScheduledDownload, ScheduledDownloadStatus } from "../types/download";
import { schedulerSchema, type SchedulerFormValues } from "../utils/schedulerValidation";

const statusTone: Record<ScheduledDownloadStatus, string> = {
  scheduled: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
  triggered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
  canceled: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
};

const statusIcon: Record<ScheduledDownloadStatus, ReactNode> = {
  scheduled: <CalendarClock size={14} aria-hidden="true" />,
  triggered: <Download size={14} aria-hidden="true" />,
  completed: <CheckCircle2 size={14} aria-hidden="true" />,
  failed: <AlertCircle size={14} aria-hidden="true" />,
  canceled: <XCircle size={14} aria-hidden="true" />
};

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function timeInputValue(): string {
  return new Date().toTimeString().slice(0, 5);
}

function goToQueue() {
  const destination = ROUTES.queue;

  if (typeof window !== "undefined") {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (currentPath !== destination) {
      window.history.pushState({}, "", destination);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
  }

  window.location.assign(destination);
}

export function SchedulerPage() {
  const { t } = useTranslation();
  const items = useSchedulerStore((state) => state.items);
  const isLoading = useSchedulerStore((state) => state.isLoading);
  const error = useSchedulerStore((state) => state.error);
  const lastTriggeredId = useSchedulerStore((state) => state.lastTriggeredId);
  const load = useSchedulerStore((state) => state.load);
  const create = useSchedulerStore((state) => state.create);
  const tick = useSchedulerStore((state) => state.tick);
  const clearError = useSchedulerStore((state) => state.clearError);
  const settings = useSettingsStore((state) => state.settings);
  const addFromMetadata = useQueueStore((state) => state.addFromMetadata);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<SchedulerFormValues>({
    defaultValues: {
      url: "",
      date: todayInputValue(),
      time: timeInputValue(),
      repeat: "once"
    }
  });

  useEffect(() => {
    void load();
  }, [load]);

  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      void load();
    }, 1000);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [load]);

  useEffect(() => {
    if (error) {
      toast.error(t(error.message));
      clearError();
    }
  }, [clearError, error, t]);

  useEffect(() => {
    if (!lastTriggeredId) {
      return;
    }

    toast.success(t("scheduler.toast.triggered"), {
      description: t("scheduler.toast.triggeredDescription"),
      action: {
        label: t("scheduler.toast.goToQueue"),
        onClick: goToQueue
      }
    });

    clearError();
  }, [clearError, lastTriggeredId, t]);

  async function onSubmit(values: SchedulerFormValues) {
    const item = await create({
      sourceUrl: values.url,
      date: values.date,
      time: values.time,
      repeat: values.repeat
    });

    if (item) {
      toast.success(t("scheduler.toast.created"), {
        description: t("scheduler.toast.scheduled")
      });
      reset({
        url: "",
        date: todayInputValue(),
        time: timeInputValue(),
        repeat: "once"
      });
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">{t("scheduler.title")}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("scheduler.summary", { count: items.length })}
        </p>
      </div>

      <form
        className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[minmax(0,1fr)_160px_140px_150px_auto] lg:items-start"
        onSubmit={handleSubmit(onSubmit)}
      >
        <Field label={t("scheduler.url")} error={errors.url?.message ? t(errors.url.message) : undefined}>
          <input
            type="url"
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            placeholder={t("scheduler.urlPlaceholder")}
            aria-invalid={errors.url ? "true" : "false"}
            {...register("url", {
              validate: (value) => {
                const result = schedulerSchema.shape.url.safeParse(value);
                return result.success || result.error.issues[0]?.message || "validation.invalidUrl";
              }
            })}
          />
        </Field>
        <Field label={t("scheduler.date")} error={errors.date?.message ? t(errors.date.message) : undefined}>
          <input
            type="date"
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            aria-invalid={errors.date ? "true" : "false"}
            {...register("date", {
              validate: (value) => {
                const result = schedulerSchema.shape.date.safeParse(value);
                return result.success || result.error.issues[0]?.message || "scheduler.validation.dateRequired";
              }
            })}
          />
        </Field>
        <Field label={t("scheduler.time")} error={errors.time?.message ? t(errors.time.message) : undefined}>
          <input
            type="time"
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            aria-invalid={errors.time ? "true" : "false"}
            {...register("time", {
              validate: (value) => {
                const result = schedulerSchema.shape.time.safeParse(value);
                return result.success || result.error.issues[0]?.message || "scheduler.validation.timeRequired";
              }
            })}
          />
        </Field>
        <Field label={t("scheduler.repeat")}>
          <select
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
            {...register("repeat")}
          >
            <option value="once">{t("scheduler.repeatOptions.once")}</option>
            <option value="daily">{t("scheduler.repeatOptions.daily")}</option>
            <option value="weekly">{t("scheduler.repeatOptions.weekly")}</option>
          </select>
        </Field>
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Plus aria-hidden="true" size={18} />
          {t("scheduler.create")}
        </button>
      </form>

      {isLoading ? <SchedulerSkeleton /> : null}

      {!isLoading && items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-semibold">{t("scheduler.emptyTitle")}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("scheduler.emptyDescription")}</p>
        </div>
      ) : null}

      {!isLoading && items.length > 0 ? (
        <div className="space-y-3" role="list" aria-label={t("scheduler.title")}>
          {items.map((item) => (
            <SchedulerRow key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
}

function Field({ label, error, children }: FieldProps) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-2 block text-slate-700 dark:text-slate-200">{label}</span>
      {children}
      {error ? <span className="mt-2 block text-sm text-red-600 dark:text-red-400">{error}</span> : null}
    </label>
  );
}

function SchedulerRow({ item }: { item: ScheduledDownload }) {
  const { t, i18n } = useTranslation();
  const cancel = useSchedulerStore((state) => state.cancel);
  const remove = useSchedulerStore((state) => state.remove);
  const canCancel = item.status === "scheduled";
  const nextRunAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(item.nextRunAt));

  return (
    <article
      role="listitem"
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="grid gap-4 lg:grid-cols-[40px_minmax(0,1fr)_120px] lg:items-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-50">
          <CalendarClock aria-hidden="true" size={20} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold">{item.sourceUrl}</h2>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${statusTone[item.status]}`}>
              {statusIcon[item.status]}
              {t(`scheduler.status.${item.status}`)}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-4">
            <span>{t("scheduler.nextRun")}: {nextRunAt}</span>
            <span>{t("scheduler.repeat")}: {t(`scheduler.repeatOptions.${item.repeat}`)}</span>
            <span>{t("scheduler.triggerCount")}: {item.triggerCount}</span>
            <span>
              {t("scheduler.lastTriggered")}:{" "}
              {item.lastTriggeredAt
                ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(item.lastTriggeredAt)
                )
                : t("scheduler.never")}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
          <IconButton
            label={t("scheduler.cancel")}
            disabled={!canCancel}
            onClick={() => void cancel(item.id)}
            icon={<XCircle size={16} />}
          />
          <IconButton label={t("scheduler.remove")} onClick={() => void remove(item.id)} icon={<Trash2 size={16} />} />
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-900"
    >
      {icon}
    </button>
  );
}

function SchedulerSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="space-y-3" aria-live="polite" aria-label={t("scheduler.loading")}>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex animate-pulse gap-4">
            <div className="h-10 w-10 rounded-md bg-slate-200 dark:bg-slate-800" />
            <div className="flex-1 space-y-3">
              <div className="h-5 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
