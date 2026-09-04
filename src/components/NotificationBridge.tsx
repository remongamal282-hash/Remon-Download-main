import { useEffect } from "react";
import { toast } from "sonner";

interface NotificationPayload {
  title: string;
  body: string;
  thumbnail?: string;
}

export function NotificationBridge() {
  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    return window.electronAPI.onNotification((notification: NotificationPayload) => {
      toast.custom((toastId) => (
        <div className="flex w-[min(420px,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
          {notification.thumbnail ? (
            <img
              src={notification.thumbnail}
              alt=""
              className="h-14 w-24 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{notification.title}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{notification.body}</p>
          </div>
          <button
            type="button"
            className="shrink-0 text-lg leading-none text-slate-400 hover:text-slate-700 dark:hover:text-white"
            onClick={() => toast.dismiss(toastId)}
            aria-label="Close"
          >
            x
          </button>
        </div>
      ), { duration: 6000, position: "bottom-right" });
    });
  }, []);

  return null;
}