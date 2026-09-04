import { app, BrowserWindow, Menu, globalShortcut, nativeImage } from "electron";
import * as path from "path";
import * as fs from "fs";
import { registerIpcHandlers } from "./ipc/handlers";
import { createTray, destroyTray, showWindow, hideWindow, hasTray } from "./tray";
import { SchedulerBackgroundLoop } from "./schedulerBackground";
import { NativeSchedulerService } from "./services/nativeSchedulerService";
import { NativeSettingsService } from "./services/nativeSettingsService";
import { NativeDownloadService } from "./services/nativeDownloadService";
import { NativeNotificationService } from "./services/nativeNotificationService";

let mainWindow: BrowserWindow | null = null;
const sharedSchedulerService = new NativeSchedulerService();
let nativeDownloadService: NativeDownloadService | null = null;
let nativeNotificationService: NativeNotificationService | null = null;
let schedulerLoop: SchedulerBackgroundLoop | null = null;
let minimizeToTrayEnabled = false;
let isQuitting = false;
const settingsService = new NativeSettingsService();
const STARTUP_HIDDEN_ARG = "--hidden";

function isStartupLaunch(): boolean {
  return process.platform === "win32" && process.argv.includes(STARTUP_HIDDEN_ARG);
}

function ensureTray(window: BrowserWindow | null): boolean {
  if (!window) {
    return false;
  }

  if (hasTray()) {
    return true;
  }

  try {
    createTray(window);
    return true;
  } catch (error) {
    console.error("[Main] Could not create system tray:", error);
    return false;
  }
}

function hideToTray(window: BrowserWindow | null, event?: { preventDefault?: () => void }): boolean {
  if (!window || !ensureTray(window)) {
    console.error("[Main] Tray is unavailable; keeping the window visible");
    return false;
  }

  event?.preventDefault?.();
  hideWindow(window);
  return true;
}

function minimizeWindow(window: BrowserWindow | null): void {
  if (!window) {
    return;
  }

  window.minimize();
}

function getAppIcon(): Electron.NativeImage | string {
  const appPath = typeof app.getAppPath === "function" ? app.getAppPath() : process.cwd();
  const candidates = [
    path.join(appPath, "icon.ico"),
    path.join(appPath, "icon.png"),
    path.join(process.cwd(), "icon.ico"),
    path.join(process.cwd(), "icon.png")
  ];

  if (process.resourcesPath && process.defaultApp !== true) {
    candidates.push(
      path.join(process.resourcesPath, "app.asar", "icon.ico"),
      path.join(process.resourcesPath, "app.asar", "icon.png"),
      path.join(process.resourcesPath, "icon.ico"),
      path.join(process.resourcesPath, "icon.png")
    );
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const img = nativeImage.createFromPath(candidate);
        if (!img.isEmpty()) {
          return img;
        }
      }
    } catch {
      // try next
    }
  }

  return path.join(appPath, "icon.png");
}

// Set the Windows toast identity before any window or notification service is created.
if (typeof app.setName === "function") {
  app.setName("Remon Download");
}
if (process.platform === "win32" && typeof app.setAppUserModelId === "function") {
  app.setAppUserModelId("com.remon.download");
}

function createWindow(): void {
  const windowIcon = getAppIcon();
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 600,
    minWidth: 900,
    minHeight: 500,
    show: !isStartupLaunch(),
    title: "Remon Download",
    icon: windowIcon,
    autoHideMenuBar: true,
    titleBarStyle: "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  if (process.platform === "win32" && typeof mainWindow.setAppDetails === "function") {
    mainWindow.setAppDetails({
      appId: "com.remon.download",
      appIconPath: path.join(app.getAppPath(), "icon.ico")
    });
  }

  if (!schedulerLoop) {
    const settingsService = new NativeSettingsService();

    void settingsService.initialize();
    void sharedSchedulerService.initialize();

    schedulerLoop = new SchedulerBackgroundLoop({
      schedulerService: sharedSchedulerService,
      getDownloadService: () => nativeDownloadService,
      getNotificationService: () => nativeNotificationService,
      getSettings: async () => {
        const settings = await settingsService.get();
        return {
          defaultQuality: settings.defaultQuality,
          defaultVideoFormat: settings.defaultVideoFormat
        };
      },
      logger: console
    });

  }

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  mainWindow.webContents.on("context-menu", (_event, params) => {
    if (!mainWindow) {
      return;
    }

    const template = [
      ...(params.isEditable
        ? [
          {
            label: "Cut",
            role: "cut" as const,
            enabled: params.editFlags.canCut
          },
          {
            label: "Copy",
            role: "copy" as const,
            enabled: params.editFlags.canCopy
          },
          {
            label: "Paste",
            role: "paste" as const,
            enabled: params.editFlags.canPaste
          },
          {
            label: "Select All",
            role: "selectAll" as const
          }
        ]
        : []),

      ...(!params.isEditable && params.selectionText
        ? [{ label: "Copy", role: "copy" as const }]
        : []),

      ...(!params.isEditable && !params.selectionText
        ? [
          {
            label: "Paste",
            role: "paste" as const,
            enabled: params.isEditable
          }
        ]
        : [])
    ];

    if (template.length === 0) {
      return;
    }

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow });
  });

  registerIpcHandlers({
    schedulerService: sharedSchedulerService,
    onDownloadServiceReady: (service) => {
      nativeDownloadService = service;
      schedulerLoop?.start();
    },
    onNotificationServiceReady: (service) => {
      nativeNotificationService = service;
    },
    onMinimizeToTrayChanged: (enabled, window) => {
      minimizeToTrayEnabled = enabled;
      const targetWindow = window ?? mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null;

      if (enabled) {
        ensureTray(targetWindow);
      } else {
        destroyTray();
        targetWindow.setSkipTaskbar(false);
      }
    },
    onWindowMinimize: (window) => {
      minimizeWindow(window);
    }
  });

  app.on("browser-window-created", (_, createdWindow) => {
    createdWindow.on("restore", () => {
      createdWindow.setSkipTaskbar(false);
    });
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, "../../dist/index.html")
    );
  }

  mainWindow.on("restore", () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false);
    }
  });

  mainWindow.on("show", () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false);
    }
  });

  // Handle close: hide to tray instead of closing
  // This prevents the entire application from closing when user clicks X
  mainWindow.on("close", (event) => {
    if (mainWindow && minimizeToTrayEnabled && !isQuitting) {
      if (hideToTray(mainWindow, event)) {
        console.log("[Main] Window close intercepted, hiding to tray");
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.remon.download");
  app.setName("Remon Download");
  await settingsService.initialize();
  const settings = await settingsService.get();
  minimizeToTrayEnabled = settings.minimizeToTray;
  if (process.platform === "win32") {
    app.setLoginItemSettings({
      openAtLogin: settings.startWithWindows,
      args: settings.startWithWindows ? [STARTUP_HIDDEN_ARG] : []
    });
  }

  createWindow();

  // Startup launches stay hidden and accessible from the system tray.
  if (mainWindow && (minimizeToTrayEnabled || isStartupLaunch())) {
    ensureTray(mainWindow);
    if (isStartupLaunch()) {
      hideWindow(mainWindow);
    }
  }

  app.on("activate", () => {
    if (mainWindow === null) {
      createWindow();

      if (mainWindow && minimizeToTrayEnabled) {
        ensureTray(mainWindow);
      }
    } else {
      // If mainWindow exists but is hidden, show it
      showWindow(mainWindow);
    }
  });

  globalShortcut.register("CommandOrControl+Shift+R", () => {
    if (mainWindow) {
      showWindow(mainWindow);
    }
  });
});

// Handle the event when user tries to close all windows
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !minimizeToTrayEnabled) {
    app.quit();
  } else if (process.platform !== "darwin") {
    console.log(
      "[Main] All windows closed, but app continues running (tray still active)"
    );
  }
});

// Clean up tray before quitting
app.on("before-quit", () => {
  isQuitting = true;
  console.log("[Main] App is quitting, destroying tray...");

  if (schedulerLoop) {
    schedulerLoop.stop();
    schedulerLoop = null;
  }

  destroyTray();
  globalShortcut.unregister("CommandOrControl+Shift+R");
});