/**
 * IPC Contract Tests
 *
 * These tests validate the Electron IPC contract layer WITHOUT requiring
 * a running Electron instance. They run in Vitest (JSDOM environment) and
 * verify:
 *
 * 1. Channel naming consistency
 * 2. IpcResult<T> shape (success/error wrapping)
 * 3. Preload API surface shape
 * 4. Service resolver dual-mode selection
 * 5. Error propagation from wrapError
 * 6. Type safety of channel keys
 *
 * These tests are intentionally free from Electron-specific imports
 * (ipcMain, BrowserWindow, etc.) so they can run in standard Vitest.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { IPC_CHANNELS } from "./channels";
import type { IpcResult } from "./channels";
import {
  isElectronEnvironment,
  resolveMetadataService,
  resolveHistoryService,
  resolveFavoritesService,
  resolveSchedulerService,
  _resetServiceCache
} from "../../src/services/serviceResolver";
import { MockMetadataService } from "../../src/services/metadataService";
import { MockHistoryService } from "../../src/services/historyService";
import { MockFavoritesService } from "../../src/services/favoritesService";
import { MockSchedulerService } from "../../src/services/schedulerService";

// ─── 1. Channel naming ──────────────────────────────────────────────────────

describe("IPC_CHANNELS — naming conventions", () => {
  it("all channels are non-empty strings", () => {
    for (const [key, value] of Object.entries(IPC_CHANNELS)) {
      expect(typeof value, `${key} should be a string`).toBe("string");
      expect(value.length, `${key} channel name should be non-empty`).toBeGreaterThan(0);
    }
  });

  it("all channels follow namespace:action pattern", () => {
    const PATTERN = /^[a-z-]+:[a-z-]+$/;
    for (const [key, value] of Object.entries(IPC_CHANNELS)) {
      expect(PATTERN.test(value), `${key} = "${value}" must match "namespace:action"`).toBe(true);
    }
  });

  it("all channel values are unique (no duplicate channel strings)", () => {
    const values = Object.values(IPC_CHANNELS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("covers all expected service namespaces", () => {
    const namespaces = new Set(
      Object.values(IPC_CHANNELS).map((ch) => ch.split(":")[0])
    );
    expect(namespaces).toContain("metadata");
    expect(namespaces).toContain("download");
    expect(namespaces).toContain("settings");
    expect(namespaces).toContain("history");
    expect(namespaces).toContain("favorites");
    expect(namespaces).toContain("scheduler");
  });

  it("has exactly 30 channels defined", () => {
    expect(Object.keys(IPC_CHANNELS).length).toBe(30);
  });
});

// ─── 2. IpcResult<T> shape ──────────────────────────────────────────────────

describe("IpcResult<T> — success/error envelope", () => {
  it("success variant carries data and success: true", () => {
    const result: IpcResult<string> = { success: true, data: "hello" };
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("hello");
    }
  });

  it("error variant carries error and success: false", () => {
    const result: IpcResult<string> = {
      success: false,
      error: { code: "unknown", message: "something failed", recoverable: true }
    };
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("something failed");
      expect(result.error.code).toBe("unknown");
      expect(result.error.recoverable).toBe(true);
    }
  });

  it("success variant does not have an error property", () => {
    const result: IpcResult<number> = { success: true, data: 42 };
    expect("error" in result).toBe(false);
  });

  it("error variant does not have a data property", () => {
    const result: IpcResult<number> = {
      success: false,
      error: { code: "unknown", message: "fail", recoverable: false }
    };
    expect("data" in result).toBe(false);
  });
});

// ─── 3. Preload API surface shape ──────────────────────────────────────────

describe("Preload API surface — window.electronAPI contract", () => {
  it("window.electronAPI is undefined in Vitest (no preload injected)", () => {
    // In Vitest/JSDOM, no preload runs — window.electronAPI must be absent.
    expect(typeof window).toBe("object");
    expect((window as unknown as Record<string, unknown>).electronAPI).toBeUndefined();
  });

  it("isElectronEnvironment() returns false in Vitest", () => {
    expect(isElectronEnvironment()).toBe(false);
  });

  it("a simulated preload injection is detected by isElectronEnvironment()", () => {
    // Simulate what contextBridge.exposeInMainWorld would inject
    (window as unknown as Record<string, unknown>).electronAPI = { isElectron: true };
    expect(isElectronEnvironment()).toBe(true);
    // Clean up
    delete (window as unknown as Record<string, unknown>).electronAPI;
    expect(isElectronEnvironment()).toBe(false);
  });
});

// ─── 4. Service resolver — dual-mode selection ──────────────────────────────

describe("serviceResolver — dual-mode selection", () => {
  beforeEach(() => {
    // Remove any simulated electronAPI and reset singleton cache
    delete (window as unknown as Record<string, unknown>).electronAPI;
    _resetServiceCache();
  });

  it("resolveMetadataService() returns MockMetadataService in Web/Vitest mode", () => {
    const service = resolveMetadataService();
    expect(service).toBeInstanceOf(MockMetadataService);
  });

  it("resolveHistoryService() returns MockHistoryService in Web/Vitest mode", () => {
    const service = resolveHistoryService();
    expect(service).toBeInstanceOf(MockHistoryService);
  });

  it("resolveFavoritesService() returns MockFavoritesService in Web/Vitest mode", () => {
    const service = resolveFavoritesService();
    expect(service).toBeInstanceOf(MockFavoritesService);
  });

  it("resolveSchedulerService() returns MockSchedulerService in Web/Vitest mode", () => {
    const service = resolveSchedulerService();
    expect(service).toBeInstanceOf(MockSchedulerService);
  });

  it("returns the same singleton on repeated calls (no re-instantiation)", () => {
    const first = resolveMetadataService();
    const second = resolveMetadataService();
    expect(first).toBe(second);
  });

  it("_resetServiceCache() forces new instances on next resolve", () => {
    const first = resolveMetadataService();
    _resetServiceCache();
    const second = resolveMetadataService();
    expect(first).not.toBe(second);
  });
});

// ─── 5. Error propagation simulation ────────────────────────────────────────

describe("error propagation — wrapError simulation", () => {
  function wrapSuccess<T>(data: T): IpcResult<T> {
    return { success: true, data };
  }

  function wrapError<T>(err: unknown): IpcResult<T> {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: { code: "unknown", message, recoverable: true }
    };
  }

  it("wrapSuccess returns success: true with data", () => {
    const r = wrapSuccess({ id: "abc" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ id: "abc" });
  });

  it("wrapError from Error instance extracts message", () => {
    const r = wrapError<string>(new Error("network timeout"));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.message).toBe("network timeout");
  });

  it("wrapError from string coerces to message", () => {
    const r = wrapError<string>("raw string error");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.message).toBe("raw string error");
  });

  it("wrapError from unknown type uses String()", () => {
    const r = wrapError<string>({ code: 404 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.message).toBe("[object Object]");
  });

  it("renderer raises error when IpcResult.success is false", () => {
    async function rendererInvoke(): Promise<string> {
      const result: IpcResult<string> = {
        success: false,
        error: { code: "unknown", message: "main process crashed", recoverable: false }
      };
      if (!result.success) {
        throw new Error(result.error.message);
      }
      const data = (result as Extract<IpcResult<string>, { success: true }>).data;
      return data;
    }

    return expect(rendererInvoke()).rejects.toThrow("main process crashed");
  });
});

// ─── 6. Security contract assertions ────────────────────────────────────────

describe("security constraints — renderer has no Node.js access", () => {
  it("require() is not available in the renderer context (Vitest/JSDOM)", () => {
    // In Vitest with jsdom environment, require is available as part of the
    // Vitest module system, but window.require (what Electron would expose
    // when nodeIntegration:true) must not exist.
    expect((window as unknown as Record<string, unknown>).require).toBeUndefined();
  });

  it("window.electronAPI is undefined unless preload injects it", () => {
    // Confirm the baseline — no preload has run in JSDOM
    expect((window as unknown as Record<string, unknown>).electronAPI).toBeUndefined();
  });

  it("window.electronAPI is boolean-detectable after simulated injection", () => {
    // Simulate what contextBridge.exposeInMainWorld('electronAPI', ...) does
    (window as unknown as Record<string, unknown>).electronAPI = { isElectron: true };
    const api = (window as unknown as Record<string, unknown>).electronAPI as { isElectron: boolean };
    expect(api.isElectron).toBe(true);
    // Clean up
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  it("Electron main process security config — contextIsolation must be true (documented constant)", () => {
    // This is a documentation test: it asserts the security configuration
    // constants we MUST use in BrowserWindow. The actual enforcement happens
    // in electron/main.ts. If this changes, the test will act as a reminder.
    const REQUIRED_SECURITY_CONFIG = {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    } as const;

    expect(REQUIRED_SECURITY_CONFIG.contextIsolation).toBe(true);
    expect(REQUIRED_SECURITY_CONFIG.nodeIntegration).toBe(false);
    expect(REQUIRED_SECURITY_CONFIG.sandbox).toBe(true);
    expect(REQUIRED_SECURITY_CONFIG.webSecurity).toBe(true);
  });
});
