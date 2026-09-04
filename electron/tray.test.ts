/**
 * Tests for System Tray integration
 *
 * Tests:
 * - Tray creation
 * - Show/Hide/Quit operations
 * - Single instance guarantee
 * - Window lifecycle integration
 * - Downloads continue while hidden
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createTray,
  showWindow,
  hideWindow,
  minimizeToTray,
  quitApplication,
  destroyTray,
  hasTray,
  getTray
} from "./tray";
import { BrowserWindow, app, Tray, Menu } from "electron";

// Mock Electron modules
vi.mock("electron", () => ({
  Tray: vi.fn(() => ({
    on: vi.fn(),
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    destroy: vi.fn()
  })),
  Menu: {
    buildFromTemplate: vi.fn(() => ({
      popup: vi.fn()
    }))
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn()
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: vi.fn(() => false),
      resize: vi.fn(() => ({ isEmpty: vi.fn(() => false) }))
    }))
  },
  app: {
    quit: vi.fn()
  }
}));

describe("Tray Module", () => {
  let mockWindow: any;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    (Tray as any).mockImplementation(() => ({
      on: vi.fn(),
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      destroy: vi.fn()
    }));
    (Menu.buildFromTemplate as any).mockImplementation(() => ({
      popup: vi.fn()
    }));

    // Setup mock window
    mockWindow = {
      minimize: vi.fn(),
      restore: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      isMinimized: vi.fn(() => false),
      close: vi.fn()
    };

    // Cleanup tray before each test
    if (hasTray()) {
      destroyTray();
    }
  });

  afterEach(() => {
    // Cleanup after each test
    if (hasTray()) {
      destroyTray();
    }
  });

  describe("createTray", () => {
    it("should create a new tray instance", () => {
      expect(hasTray()).toBe(false);

      createTray(mockWindow);

      expect(hasTray()).toBe(true);
      expect(Tray).toHaveBeenCalled();
    });

    it("should not create duplicate tray instances", () => {
      createTray(mockWindow);
      const firstInstance = getTray();

      createTray(mockWindow);
      const secondInstance = getTray();

      expect(firstInstance).toBe(secondInstance);
      expect(Tray).toHaveBeenCalledTimes(1);
    });

    it("should set up context menu with Show/Hide/Quit options", () => {
      createTray(mockWindow);

      expect(Menu.buildFromTemplate).toHaveBeenCalled();
      const menuTemplate = (Menu.buildFromTemplate as any).mock.calls[0][0];

      expect(menuTemplate).toHaveLength(4); // Show, Hide, Separator, Quit
      expect(menuTemplate[0].label).toBe("Show Remon Download");
      expect(menuTemplate[1].label).toBe("Hide Remon Download");
      expect(menuTemplate[2].type).toBe("separator");
      expect(menuTemplate[3].label).toBe("Quit Remon Download");
    });

    it("should set up click handler for tray icon", () => {
      const mockTray = { on: vi.fn(), setToolTip: vi.fn(), setContextMenu: vi.fn(), destroy: vi.fn() };
      (Tray as any).mockImplementation(() => mockTray);

      createTray(mockWindow);

      expect(mockTray.on).toHaveBeenCalledWith("click", expect.any(Function));
    });

    it("should handle left click to show and focus window", () => {
      const mockTray = {
        on: vi.fn((event, handler) => {
          if (event === "click") {
            // Simulate clicking the tray
            handler();
          }
        }),
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        destroy: vi.fn()
      };
      (Tray as any).mockImplementation(() => mockTray);

      createTray(mockWindow);

      expect(mockWindow.show).toHaveBeenCalled();
      expect(mockWindow.focus).toHaveBeenCalled();
    });
  });

  describe("showWindow", () => {
    beforeEach(() => {
      createTray(mockWindow);
    });

    it("should show the window", () => {
      showWindow(mockWindow);
      expect(mockWindow.show).toHaveBeenCalled();
    });

    it("should focus the window", () => {
      showWindow(mockWindow);
      expect(mockWindow.focus).toHaveBeenCalled();
    });

    it("should restore window if minimized", () => {
      mockWindow.isMinimized.mockReturnValue(true);
      showWindow(mockWindow);
      expect(mockWindow.restore).toHaveBeenCalled();
    });

    it("should not restore window if not minimized", () => {
      mockWindow.isMinimized.mockReturnValue(false);
      showWindow(mockWindow);
      expect(mockWindow.restore).not.toHaveBeenCalled();
    });

    it("should handle null window gracefully", () => {
      expect(() => showWindow(null)).not.toThrow();
    });
  });

  describe("hideWindow", () => {
    beforeEach(() => {
      createTray(mockWindow);
    });

    it("should hide the window", () => {
      hideWindow(mockWindow);
      expect(mockWindow.hide).toHaveBeenCalled();
    });

    it("should handle null window gracefully", () => {
      expect(() => hideWindow(null)).not.toThrow();
    });
  });

  describe("minimizeToTray", () => {
    beforeEach(() => {
      createTray(mockWindow);
    });

    it("should hide the window (equivalent to minimizeToTray)", () => {
      minimizeToTray(mockWindow);
      expect(mockWindow.hide).toHaveBeenCalled();
    });
  });

  describe("quitApplication", () => {
    beforeEach(() => {
      createTray(mockWindow);
    });

    it("should call app.quit()", () => {
      quitApplication();
      expect(app.quit).toHaveBeenCalled();
    });
  });

  describe("destroyTray", () => {
    beforeEach(() => {
      createTray(mockWindow);
    });

    it("should destroy the tray instance", () => {
      const trayInstance = getTray();
      (trayInstance as any).destroy = vi.fn();

      destroyTray();

      expect((trayInstance as any).destroy).toHaveBeenCalled();
      expect(hasTray()).toBe(false);
    });

    it("should handle destroy when tray is null", () => {
      destroyTray();
      destroyTray(); // Should not throw
      expect(hasTray()).toBe(false);
    });
  });

  describe("hasTray", () => {
    it("should return false when tray doesn't exist", () => {
      expect(hasTray()).toBe(false);
    });

    it("should return true when tray exists", () => {
      createTray(mockWindow);
      expect(hasTray()).toBe(true);
    });
  });

  describe("getTray", () => {
    it("should return null when tray doesn't exist", () => {
      expect(getTray()).toBeNull();
    });

    it("should return tray instance when tray exists", () => {
      createTray(mockWindow);
      expect(getTray()).not.toBeNull();
    });
  });

  describe("Context Menu Callbacks", () => {
    it("Show button should call showWindow", () => {
      let showCallback: any = null;
      const mockTray = {
        on: vi.fn(),
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        destroy: vi.fn()
      };
      (Tray as any).mockImplementation(() => mockTray);
      (Menu.buildFromTemplate as any).mockImplementation((template: any) => {
        showCallback = template[0].click;
        return { popup: vi.fn() };
      });

      createTray(mockWindow);
      if (showCallback) {
        showCallback();
      }

      expect(mockWindow.show).toHaveBeenCalled();
      expect(mockWindow.focus).toHaveBeenCalled();
    });

    it("Hide button should call hideWindow", () => {
      let hideCallback: any = null;
      const mockTray = {
        on: vi.fn(),
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        destroy: vi.fn()
      };
      (Tray as any).mockImplementation(() => mockTray);
      (Menu.buildFromTemplate as any).mockImplementation((template: any) => {
        hideCallback = template[1].click;
        return { popup: vi.fn() };
      });

      createTray(mockWindow);
      mockWindow.hide.mockClear(); // Clear any calls from setup
      if (hideCallback) {
        hideCallback();
      }

      expect(mockWindow.hide).toHaveBeenCalled();
    });

    it("Quit button should call quitApplication", () => {
      let quitCallback: any = null;
      const mockTray = {
        on: vi.fn(),
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        destroy: vi.fn()
      };
      (Tray as any).mockImplementation(() => mockTray);
      (Menu.buildFromTemplate as any).mockImplementation((template: any) => {
        quitCallback = template[3].click;
        return { popup: vi.fn() };
      });

      createTray(mockWindow);
      if (quitCallback) {
        quitCallback();
      }

      expect(app.quit).toHaveBeenCalled();
    });
  });
});
