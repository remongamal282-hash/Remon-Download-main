import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { QueueHistoryBridge } from "./components/QueueHistoryBridge";
import { NotificationBridge } from "./components/NotificationBridge";
import { AppLayout } from "./layouts/AppLayout";
import { AboutPage } from "./pages/AboutPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmptyPage } from "./pages/EmptyPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { QueuePage } from "./pages/QueuePage";
import { SchedulerPage } from "./pages/SchedulerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useSettingsStore } from "./stores/settingsStore";
import { ROUTES } from "./constants/routes";

export function App() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSettings = useSettingsStore((state) => state.loadSettings);

  useEffect(() => {
    // Load settings asynchronously before rendering
    loadSettings()
      .then(() => {
        console.log('[App] Settings loaded successfully');
        setIsReady(true);
      })
      .catch((err) => {
        console.error('[App] Failed to load settings:', err);
        setError(String(err?.message || err));
        setIsReady(true); // Render anyway with defaults
      });
  }, [loadSettings]);

  if (!isReady) {
    // Show loading spinner while settings load
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
            <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">Loading...</span>
          </div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading Remon Download...</p>
          {error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">Error: {error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path={ROUTES.dashboard} element={<DashboardPage />} />
            <Route path={ROUTES.queue} element={<QueuePage />} />
            <Route path={ROUTES.history} element={<HistoryPage />} />
            <Route path={ROUTES.favorites} element={<FavoritesPage />} />
            <Route path={ROUTES.scheduler} element={<SchedulerPage />} />
            <Route path={ROUTES.settings} element={<SettingsPage />} />
            <Route path={ROUTES.about} element={<AboutPage />} />
            <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <QueueHistoryBridge />
      <NotificationBridge />
      <Toaster richColors closeButton />
    </ErrorBoundary>
  );
}
