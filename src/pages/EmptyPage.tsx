import { useTranslation } from "react-i18next";

interface EmptyPageProps {
  pageKey: "queue" | "history" | "favorites" | "scheduler" | "settings";
}

export function EmptyPage({ pageKey }: EmptyPageProps) {
  const { t } = useTranslation();

  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
      <h1 className="text-2xl font-semibold">{t(`nav.${pageKey}`)}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("common.empty")}</p>
    </section>
  );
}
