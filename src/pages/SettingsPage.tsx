import { RotateCcw, Save } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CONCURRENT_DOWNLOAD_OPTIONS, SPEED_LIMIT_OPTIONS } from "../constants/download";
import { AUDIO_FORMAT_OPTIONS, QUALITY_OPTIONS, VIDEO_FORMAT_OPTIONS } from "../constants/settings";
import { useSettingsStore } from "../stores/settingsStore";
import type { AppSettings, SpeedLimit } from "../types/settings";

function renderFileNamePreview(template: string, settings: AppSettings): string {
  const replaceToken = (value: string, token: string, replacement: string) => value.split(token).join(replacement);
  let preview = template;

  preview = replaceToken(preview, "%(uploader)s", "Example Channel");
  preview = replaceToken(preview, "%(title)s", "Amazing Nature Documentary");
  preview = replaceToken(preview, "%(resolution)s", settings.defaultQuality);
  preview = replaceToken(preview, "%(ext)s", settings.defaultVideoFormat);

  return preview;
}

function parseSpeedLimit(value: string): SpeedLimit {
  return value === "unlimited" ? "unlimited" : Number(value);
}

export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const resetSettings = useSettingsStore((state) => state.resetSettings);
  const fileNamePreview = renderFileNamePreview(settings.fileNameTemplate, settings);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    updateSettings({ [key]: value });
  }

  function handleBooleanChange(key: keyof AppSettings) {
    return (event: ChangeEvent<HTMLInputElement>) => updateSettings({ [key]: event.target.checked });
  }

  function handleReset() {
    resetSettings();
    toast.success(t("settings.toast.reset"));
  }

  async function handleSelectDownloadFolder() {
    if (typeof window !== "undefined" && window.electronAPI?.settings?.selectDownloadFolder) {
      try {
        const folder = await window.electronAPI.settings.selectDownloadFolder();
        if (folder) {
          update("downloadFolder", folder);
        }
        return;
      } catch (error) {
        console.error("[SettingsPage] Failed to select download folder:", error);
      }
    }

    toast.info(t("settings.toast.folderPickerUnavailable"));
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("settings.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RotateCcw aria-hidden="true" size={18} />
          {t("settings.reset")}
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsSection title={t("settings.sections.general")}>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextField
                label={t("settings.downloadFolder")}
                value={settings.downloadFolder}
                onChange={(value) => update("downloadFolder", value)}
              />
            </div>
            <button
              type="button"
              onClick={handleSelectDownloadFolder}
              className="mt-7 inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t("settings.browse")}
            </button>
          </div>
          <Toggle
            label={t("settings.startWithWindows")}
            checked={settings.startWithWindows}
            onChange={handleBooleanChange("startWithWindows")}
          />
          <Toggle
            label={t("settings.minimizeToTray")}
            checked={settings.minimizeToTray}
            onChange={handleBooleanChange("minimizeToTray")}
          />
        </SettingsSection>

        <SettingsSection title={t("settings.sections.appearance")}>
          <SelectField
            label={t("settings.theme")}
            value={settings.appearance}
            onChange={(value) => update("appearance", value as AppSettings["appearance"])}
            options={[
              { value: "light", label: t("settings.themeOptions.light") },
              { value: "dark", label: t("settings.themeOptions.dark") },
              { value: "system", label: t("settings.themeOptions.system") }
            ]}
          />
          <SelectField
            label={t("settings.language")}
            value={settings.language}
            onChange={(value) => update("language", value as AppSettings["language"])}
            options={[
              { value: "en", label: t("settings.languageOptions.en") },
              { value: "ar", label: t("settings.languageOptions.ar") }
            ]}
          />
        </SettingsSection>

        <SettingsSection title={t("settings.sections.downloads")}>
          <SelectField
            label={t("settings.concurrentDownloads")}
            value={String(settings.concurrentDownloads)}
            onChange={(value) =>
              update("concurrentDownloads", Number(value) as AppSettings["concurrentDownloads"])
            }
            options={CONCURRENT_DOWNLOAD_OPTIONS.map((option) => ({ value: String(option), label: String(option) }))}
          />
          <SelectField
            label={t("settings.speedLimit")}
            value={String(settings.speedLimit)}
            onChange={(value) => update("speedLimit", parseSpeedLimit(value))}
            options={SPEED_LIMIT_OPTIONS.map((option) => ({ value: String(option.value), label: t(option.labelKey) }))}
          />
          <SelectField
            label={t("settings.defaultQuality")}
            value={settings.defaultQuality}
            onChange={(value) => update("defaultQuality", value)}
            options={QUALITY_OPTIONS.map((option) => ({ value: option, label: option }))}
          />
          <SelectField
            label={t("settings.defaultVideoFormat")}
            value={settings.defaultVideoFormat}
            onChange={(value) => update("defaultVideoFormat", value)}
            options={VIDEO_FORMAT_OPTIONS.map((option) => ({ value: option, label: option }))}
          />
          <SelectField
            label={t("settings.defaultAudioFormat")}
            value={settings.defaultAudioFormat}
            onChange={(value) => update("defaultAudioFormat", value)}
            options={AUDIO_FORMAT_OPTIONS.map((option) => ({ value: option, label: option }))}
          />
        </SettingsSection>

        <SettingsSection title={t("settings.sections.notifications")}>
          <Toggle
            label={t("settings.enableNotifications")}
            checked={settings.enableNotifications}
            onChange={handleBooleanChange("enableNotifications")}
          />
          <Toggle
            label={t("settings.notificationWhenCompleted")}
            checked={settings.notificationWhenCompleted}
            onChange={handleBooleanChange("notificationWhenCompleted")}
          />
          <Toggle
            label={t("settings.notificationWhenFailed")}
            checked={settings.notificationWhenFailed}
            onChange={handleBooleanChange("notificationWhenFailed")}
          />
        </SettingsSection>

        <SettingsSection title={t("settings.sections.clipboard")}>
          <Toggle
            label={t("settings.clipboardMonitoring")}
            checked={settings.clipboardMonitoring}
            onChange={handleBooleanChange("clipboardMonitoring")}
          />
          <Toggle
            label={t("settings.askBeforeDownloading")}
            checked={settings.askBeforeDownloading}
            onChange={handleBooleanChange("askBeforeDownloading")}
          />
        </SettingsSection>

        <SettingsSection title={t("settings.sections.advanced")}>
          <TextField
            label={t("settings.ytdlpPath")}
            value={settings.ytdlpPath}
            onChange={(value) => update("ytdlpPath", value)}
          />
          <TextField
            label={t("settings.ffmpegPath")}
            value={settings.ffmpegPath}
            onChange={(value) => update("ffmpegPath", value)}
          />
          <TextField
            label={t("settings.proxy")}
            value={settings.proxy}
            onChange={(value) => update("proxy", value)}
          />
        </SettingsSection>
      </div>

      <SettingsSection title={t("settings.sections.fileNaming")}>
        <TextField
          label={t("settings.fileNameTemplate")}
          value={settings.fileNameTemplate}
          onChange={(value) => update("fileNameTemplate", value)}
        />
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
          <p className="font-medium text-slate-700 dark:text-slate-200">{t("settings.fileNamePreview")}</p>
          <p className="mt-1 break-words text-slate-600 dark:text-slate-300">{fileNamePreview}</p>
        </div>
      </SettingsSection>

      <div className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <Save aria-hidden="true" size={16} />
        {t("settings.autoSaved")}
      </div>
    </section>
  );
}

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function TextField({ label, value, onChange }: TextFieldProps) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-2 block text-slate-700 dark:text-slate-200">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
      />
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
}

function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-2 block text-slate-700 dark:text-slate-200">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-3 text-sm font-medium dark:border-slate-800">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
    </label>
  );
}
