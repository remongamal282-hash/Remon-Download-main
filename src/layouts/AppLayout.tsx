import { Download, Heart, History, Home, Info, ListVideo, Settings, Timer } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ROUTES } from "../constants/routes";
import { DevToolsPanel } from "../components/DevToolsPanel";

const navItems = [
  { to: ROUTES.dashboard, labelKey: "nav.dashboard", icon: Home },
  { to: ROUTES.queue, labelKey: "nav.queue", icon: ListVideo },
  { to: ROUTES.history, labelKey: "nav.history", icon: History },
  { to: ROUTES.favorites, labelKey: "nav.favorites", icon: Heart },
  { to: ROUTES.scheduler, labelKey: "nav.scheduler", icon: Timer },
  { to: ROUTES.settings, labelKey: "nav.settings", icon: Settings },
  { to: ROUTES.about, labelKey: "nav.about", icon: Info }
] as const;

export function AppLayout() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <aside className="flex w-64 shrink-0 flex-col border-e border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center justify-center border-b border-slate-200 px-5 dark:border-slate-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Download aria-hidden="true" size={22} />
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Primary">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-50"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  ].join(" ")
                }
              >
                <Icon aria-hidden="true" size={18} />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-header-draggable flex h-16 items-center justify-end gap-2 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900"></header>
        <main className="min-w-0 flex-1 p-4">
          <Outlet />
        </main>
      </div>
      {import.meta.env.DEV ? <DevToolsPanel /> : null}
    </div>
  );
}
