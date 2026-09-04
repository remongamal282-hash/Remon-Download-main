/**
 * System Tray integration for Remon Download
 *
 * Manages:
 * - Tray icon creation
 * - Context menu (Show/Hide/Quit)
 * - Window visibility management
 * - Single Tray instance lifecycle
 */

import { Tray, Menu, BrowserWindow, app, nativeImage } from "electron";
import * as path from "path";
import * as fs from "fs";

let tray: Tray | null = null;

function setSkipTaskbar(mainWindow: BrowserWindow, skip: boolean): void {
  if (typeof mainWindow.setSkipTaskbar === "function") {
    mainWindow.setSkipTaskbar(skip);
  }
}

const getIconPath = (): string => {
  const appPath = typeof app.getAppPath === "function"
    ? app.getAppPath()
    : path.resolve(__dirname, "../..");
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

  const iconPath = candidates.find((candidate) => fs.existsSync(candidate));
  return iconPath ?? candidates[0];
};

/**
 * Create the System Tray icon and context menu
 * Must be called after app.whenReady()
 */
export function createTray(mainWindow: BrowserWindow): Tray {
  if (tray) {
    console.warn("[Tray] Tray already exists, returning existing instance");
    return tray;
  }

  try {
    const iconPath = getIconPath();
    console.log(`[Tray] Loading icon from: ${iconPath}`);
    if (!fs.existsSync(iconPath)) {
      throw new Error(`Tray icon file does not exist: ${iconPath}`);
    }

    const sourceIcon = nativeImage.createFromPath(iconPath);
    if (sourceIcon.isEmpty()) {
      throw new Error(`Tray icon could not be decoded: ${iconPath}`);
    }

    const icon = sourceIcon.resize({ width: 16, height: 16 });
    if (icon.isEmpty()) {
      throw new Error(`Tray icon could not be loaded: ${iconPath}`);
    }
    tray = new Tray(icon);
    if (typeof tray.setImage === "function") {
      tray.setImage(icon);
    }
    console.log("[Tray] Icon ready");

    // Set the tooltip
    tray.setToolTip("Remon Download");

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show Remon Download",
        click: () => {
          showWindow(mainWindow);
        }
      },
      {
        label: "Hide Remon Download",
        click: () => {
          hideWindow(mainWindow);
        }
      },
      {
        type: "separator"
      },
      {
        label: "Quit Remon Download",
        click: () => {
          quitApplication();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    // Left click on tray icon: show and focus
    tray.on("click", () => {
      showWindow(mainWindow);
    });

    // Right click is handled by context menu automatically

    console.log("[Tray] System Tray created successfully");
    return tray;
  } catch (error) {
    console.error("[Tray] Failed to create tray:", error);
    throw error;
  }
}

/**
 * Show the main window and focus it
 */
export function showWindow(mainWindow: BrowserWindow | null): void {
  if (!mainWindow) {
    console.warn("[Tray] mainWindow is null, cannot show");
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  setSkipTaskbar(mainWindow, false);
  mainWindow.show();
  mainWindow.focus();

  console.log("[Tray] Window shown and focused");
}

/**
 * Hide the main window (without closing it)
 * Window remains in memory and processes continue
 */
export function hideWindow(mainWindow: BrowserWindow | null): void {
  if (!mainWindow) {
    console.warn("[Tray] mainWindow is null, cannot hide");
    return;
  }

  setSkipTaskbar(mainWindow, true);
  mainWindow.hide();
  console.log("[Tray] Window hidden");
}

/**
 * Minimize the window to tray (hide)
 * This is called when the minimize button is clicked
 */
export function minimizeToTray(mainWindow: BrowserWindow | null): void {
  hideWindow(mainWindow);
}

/**
 * Perform a complete application quit
 * This will close the window and exit the Electron app
 */
export function quitApplication(): void {
  console.log("[Tray] Quitting application...");
  app.quit();
}

/**
 * Destroy the Tray instance
 * Call this during app quit to clean up resources
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
    console.log("[Tray] Tray destroyed");
  }
}

/**
 * Check if Tray exists
 */
export function hasTray(): boolean {
  return tray !== null;
}

/**
 * Get the current Tray instance (for testing purposes)
 */
export function getTray(): Tray | null {
  return tray;
}
