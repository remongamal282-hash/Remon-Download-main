import { app, nativeImage, Notification } from "electron";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import type { DownloadItem, ScheduledDownload, VideoMetadata } from "../../src/types/download";
import type { AppSettings } from "../../src/types/settings";
import type { DownloadStateChangePayload } from "../ipc/channels";
import { getYouTubeThumbnailFallback } from "../../src/utils/thumbnail";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapePowerShell(value: string): string {
  return value.replace(/'/g, "''");
}

async function showWindowsToast(
  title: string,
  body: string,
  thumbnail: Buffer | undefined
): Promise<void> {
  if (!thumbnail) {
    throw new Error("thumbnail_unavailable");
  }

  const imagePath = path.join(
    app.getPath("temp"),
    `remon-download-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`
  );
  await fs.writeFile(imagePath, thumbnail);

  const imageUri = pathToFileURL(imagePath).toString();
  const xml = `<toast><visual><binding template="ToastGeneric"><image placement="appLogoOverride" hint-crop="circle" src="${escapeXml(imageUri)}"/><text>${escapeXml(title)}</text><text>${escapeXml(body)}</text></binding></visual></toast>`;
  const script = `Add-Type -AssemblyName System.Runtime.WindowsRuntime; $xml = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime]::new(); $xml.LoadXml('${escapePowerShell(xml)}'); $toast = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]::new($xml); [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]::CreateToastNotifier('com.remon.download').Show($toast)`;
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedScript],
        { windowsHide: true },
        (error) => error ? reject(error) : resolve()
      );
    });
  } finally {
    // Windows notifications read the file after Show() returns.
    const cleanupTimer = setTimeout(() => {
      void fs.unlink(imagePath).catch(() => undefined);
    }, 5 * 60 * 1000);
    cleanupTimer.unref?.();
  }
}

export class NativeNotificationService {
  private settings: AppSettings;
  private sentKeys = new Set<string>();
  private pendingKeys = new Set<string>();

  constructor(settings: AppSettings) {
    this.settings = settings;
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings;
  }

  handleDownloadStateChange(payload: DownloadStateChangePayload, item: DownloadItem): void {
    if (payload.status === "retrying") {
      this.sentKeys.delete(`completed:${payload.id}`);
      this.sentKeys.delete(`failed:${payload.id}`);
      return;
    }

    if (payload.status === "completed") {
      if (!this.settings.enableNotifications || !this.settings.notificationWhenCompleted) {
        console.log(`[Notification] Completion notification disabled: ${payload.id}`);
        return;
      }

      this.sendDownloadOnce(`completed:${payload.id}`, {
        title: item.title || "Remon Download",
        body: this.settings.language === "ar"
          ? "تم تحميل الفيديو بنجاح"
          : "Download completed successfully",
        thumbnail: item.thumbnail || undefined,
        sourceUrl: item.sourceUrl
      });
      return;
    }

    if (payload.status === "failed") {
      if (!this.settings.enableNotifications || !this.settings.notificationWhenFailed) {
        console.log(`[Notification] Failure notification disabled: ${payload.id}`);
        return;
      }

      this.sendDownloadOnce(`failed:${payload.id}`, {
        title: item.title || "Remon Download",
        body: this.getFailureNotificationMessage(payload.errorCode, payload.errorMessage)
      });
    }
  }

  private getFailureNotificationMessage(
    errorCode?: DownloadStateChangePayload["errorCode"],
    errorMessage?: string
  ): string {
    if (this.settings.language !== "ar") {
      if (errorMessage?.match(/exit code\s+.+$/i)) {
        return "Download failed during processing";
      }
      return errorMessage || "Download failed";
    }

    if (errorCode === "network_error") {
      return "فشل تحميل الفيديو بسبب خطأ في الشبكة";
    }
    if (errorCode === "video_unavailable") {
      return "الفيديو غير متاح أو تمت إزالته";
    }
    if (errorCode === "video_private") {
      return "الفيديو خاص أو يتطلب صلاحية للوصول إليه";
    }
    if (errorCode === "ffmpeg_error") {
      return "فشل تجهيز الفيديو بواسطة FFmpeg";
    }
    if (errorCode === "ytdlp_not_found") {
      return "تعذر العثور على yt-dlp";
    }

    const normalizedMessage = errorMessage?.toLowerCase() ?? "";
    if (normalizedMessage.includes("network") || normalizedMessage.includes("connection")) {
      return "فشل تحميل الفيديو بسبب خطأ في الشبكة";
    }
    if (normalizedMessage.includes("private") || normalizedMessage.includes("members-only")) {
      return "الفيديو خاص أو يتطلب صلاحية للوصول إليه";
    }
    if (normalizedMessage.includes("unavailable") || normalizedMessage.includes("not available")) {
      return "الفيديو غير متاح أو تمت إزالته";
    }
    if (normalizedMessage.includes("ffmpeg") || normalizedMessage.includes("postprocessor")) {
      return "فشل تجهيز الفيديو بواسطة FFmpeg";
    }
    if (normalizedMessage.includes("permission") || normalizedMessage.includes("access denied")) {
      return "لا توجد صلاحية كافية لحفظ الفيديو";
    }
    if (normalizedMessage.includes("disk full") || normalizedMessage.includes("no space")) {
      return "لا توجد مساحة كافية لحفظ الفيديو";
    }

    const exitCodeMatch = errorMessage?.match(/exit code\s+(.+)$/i);
    if (exitCodeMatch?.[1]) {
      return "تعذر تحميل الفيديو بسبب خطأ أثناء المعالجة";
    }

    return "فشل تحميل الفيديو";
  }

  notifyScheduledDownload(schedule: ScheduledDownload, metadata?: VideoMetadata): void {
    if (!this.settings.enableNotifications) {
      console.log(`[Notification] Scheduled notification disabled: ${schedule.id}`);
      return;
    }

    this.sendDownloadOnce(`scheduled:${schedule.id}:${schedule.triggerCount}`, {
      title: metadata?.title || "Remon Download",
      body: this.settings.language === "ar"
        ? "تمت إضافة التحميل المجدول إلى قائمة التنزيلات"
        : "Scheduled download queued",
      thumbnail: metadata?.thumbnail,
      sourceUrl: metadata?.sourceUrl
    });
  }

  private sendOnce(key: string, options: { title: string; body: string; thumbnail?: string; sourceUrl?: string }): void {
    if (this.sentKeys.has(key) || this.pendingKeys.has(key)) {
      console.log(`[Notification] Duplicate suppressed: ${key}`);
      return;
    }

    try {
      if (!Notification.isSupported()) {
        console.warn(`[Notification] Windows notifications are not supported: ${key}`);
        return;
      }

      this.pendingKeys.add(key);
      void this.showNotification(key, options);
    } catch (error) {
      console.error(`[Notification] Failed to show notification (${key}):`, error);
    }
  }

  private sendDownloadOnce(
    key: string,
    options: { title: string; body: string; thumbnail?: string; sourceUrl?: string }
  ): void {
    this.sendOnce(key, options);
  }

  private showNotification(
    key: string,
    options: { title: string; body: string; thumbnail?: string; sourceUrl?: string; icon?: string }
  ): Promise<void> {
    if (this.sentKeys.has(key)) {
      return Promise.resolve();
    }

    return (async () => {
      try {
        if (!Notification.isSupported()) {
          console.warn(`[Notification] Windows notifications are not supported: ${key}`);
          return;
        }

        if (process.platform === "win32" && typeof app.setAppUserModelId === "function") {
          app.setAppUserModelId("com.remon.download");
        }

        const appRoot = typeof app.getAppPath === "function" ? app.getAppPath() : process.cwd();
        const appIconCandidates = [
          path.join(appRoot, "icon.ico"),
          path.join(appRoot, "icon.png"),
          path.join(process.cwd(), "icon.ico"),
          path.join(process.cwd(), "icon.png"),
          ...(process.resourcesPath ? [
            path.join(process.resourcesPath, "app.asar", "icon.ico"),
            path.join(process.resourcesPath, "app.asar", "icon.png"),
            path.join(process.resourcesPath, "icon.ico"),
            path.join(process.resourcesPath, "icon.png")
          ] : [])
        ];

        let iconImage: Electron.NativeImage | undefined;
        let thumbnailBuffer: Buffer | undefined;
        const thumbnailCandidates = Array.from(new Set([
          options.thumbnail
        ].filter((thumbnail): thumbnail is string => Boolean(thumbnail))));

        const fallbackThumbnail = options.sourceUrl ? getYouTubeThumbnailFallback(options.sourceUrl) : null;
        if (fallbackThumbnail && !thumbnailCandidates.includes(fallbackThumbnail)) {
          thumbnailCandidates.push(fallbackThumbnail);
        }

        for (const thumbnail of thumbnailCandidates) {
          try {
            const response = await fetch(thumbnail, {
              headers: { "user-agent": "Mozilla/5.0" }
            });
            if (!response.ok) {
              continue;
            }

            const candidateBuffer = Buffer.from(await response.arrayBuffer());
            const image = nativeImage.createFromBuffer(candidateBuffer);
            if (image.isEmpty()) {
              continue;
            }

            thumbnailBuffer = candidateBuffer;
            iconImage = image;
            break;
          } catch (error) {
            console.warn(`[Notification] Could not load thumbnail for ${key}:`, error);
          }
        }

        if (process.platform === "win32" && thumbnailBuffer) {
          try {
            await showWindowsToast(options.title, options.body, thumbnailBuffer);
            this.sentKeys.add(key);
            console.log(`[Notification] Windows thumbnail notification shown: ${key}`);
            return;
          } catch (error) {
            console.warn(`[Notification] Windows thumbnail notification failed; using fallback:`, error);
          }
        }

        for (const candidate of appIconCandidates) {
          if (iconImage) {
            break;
          }
          try {
            const img = nativeImage.createFromPath(candidate);
            if (!img.isEmpty()) {
              iconImage = img;
              break;
            }
          } catch {
            // continue
          }
        }

        const notificationOptions: Electron.NotificationConstructorOptions = {
          title: options.title,
          body: options.body,
          ...(iconImage && !iconImage.isEmpty() ? { icon: iconImage } : {})
        };

        const notification = new Notification(notificationOptions);
        notification.show();
        this.sentKeys.add(key);
        console.log(`[Notification] Shown: ${key}`);
      } catch (error) {
        console.error(`[Notification] Failed to show notification (${key}):`, error);
      } finally {
        this.pendingKeys.delete(key);
      }
    })();
  }

}
