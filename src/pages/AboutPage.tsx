import { useTranslation } from "react-i18next";
import { Download, Info } from "lucide-react";

const CONTACT_PHONE = "201067006714";
const CONTACT_WHATSAPP = "201067006714";
const CONTACT_EMAIL = "remongamal282@gmail.com";

export function AboutPage() {
  const { t } = useTranslation();
  const details = [
    { label: t("about.applicationName"), value: t("app.name") },
    { label: t("common.version"), value: __APP_VERSION__ },
    { label: t("about.developer"), value: "Remon Gamal" }
  ];

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Download aria-hidden="true" size={28} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("nav.about")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{t("app.name")}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {t("about.description")}
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">{t("about.developerTitle")}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("about.developerDescription")}</p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">{t("about.productTitle")}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("about.productDescription")}</p>
        <p className="mt-3 text-sm font-medium">{t("about.platforms")}: {t("about.platformList")}</p>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{t("about.copyright")}</p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <Info aria-hidden="true" size={18} className="text-brand-600 dark:text-brand-50" />
          <h2 className="text-lg font-semibold">{t("about.details")}</h2>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {details.map((detail) => (
            <div key={detail.label} className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">{detail.label}</dt>
              <dd className="mt-2 break-words font-medium">{detail.value}</dd>
            </div>
          ))}
          <div className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
            <dt className="text-slate-500 dark:text-slate-400">{t("about.contact")}</dt>
            <dd className="mt-2 space-y-2 break-words font-medium">
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("about.phone")}: </span>
                <a className="text-brand-700 hover:underline dark:text-brand-50" href={`tel:+${CONTACT_PHONE}`} dir="ltr">
                  {CONTACT_PHONE}
                </a>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("about.whatsapp")}: </span>
                <a
                  className="text-brand-700 hover:underline dark:text-brand-50"
                  href={`https://wa.me/${CONTACT_WHATSAPP}`}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                >
                  {CONTACT_WHATSAPP}
                </a>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">{t("about.email")}: </span>
                <a className="text-brand-700 hover:underline dark:text-brand-50" href={`mailto:${CONTACT_EMAIL}`} dir="ltr">
                  {CONTACT_EMAIL}
                </a>
              </div>
            </dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
