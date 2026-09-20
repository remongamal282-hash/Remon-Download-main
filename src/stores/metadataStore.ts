import { create } from "zustand";
import { resolveMetadataService } from "../services/serviceResolver";
import type { AnalysisResult } from "../types/download";
import type { ErrorModel } from "../types/errors";

interface MetadataState {
  result: AnalysisResult | null;
  isAnalyzing: boolean;
  error: ErrorModel | null;
  analyze: (url: string) => Promise<AnalysisResult | null>;
  clear: () => void;
}

let currentRequestId = 0;
let activeUrl: string | null = null;
let activePromise: Promise<AnalysisResult | null> | null = null;

export function mapMetadataError(error: unknown): ErrorModel {
  const message = error instanceof Error ? error.message : String(error);

  if (message === "unsupported_url") {
    return {
      code: "unsupported_url",
      message: "errors.unsupportedUrl",
      recoverable: true
    };
  }

  if (message === "ytdlp_timeout" || message === "timeout") {
    return {
      code: "timeout",
      message: "errors.timeout",
      recoverable: true
    };
  }

  if (message === "video_private") {
    return {
      code: "video_private",
      message: "errors.videoPrivate",
      recoverable: true
    };
  }

  if (message === "video_unavailable") {
    return {
      code: "video_unavailable",
      message: "errors.videoUnavailable",
      recoverable: true
    };
  }

  if (message === "network_error") {
    return {
      code: "network_error",
      message: "errors.networkError",
      recoverable: true
    };
  }

  if (
    message === "ytdlp_not_found" ||
    message === "ytdlp_spawn_failed" ||
    message === "ytdlp_failed" ||
    message === "ytdlp_invalid_json"
  ) {
    return {
      code: "ytdlp_error",
      message: "errors.ytdlpError",
      recoverable: true
    };
  }

  return {
    code: "unknown",
    message: "errors.unknown",
    recoverable: true
  };
}

export const useMetadataStore = create<MetadataState>((set, get) => ({
  result: null,
  isAnalyzing: false,
  error: null,
  analyze: async (url) => {
    const trimmedUrl = url?.trim() ?? "";
    if (!trimmedUrl) {
      set({ result: null, error: null, isAnalyzing: false });
      return null;
    }

    // If identical URL is already being analyzed in-flight, reuse its promise
    if (get().isAnalyzing && activeUrl === trimmedUrl && activePromise) {
      return activePromise;
    }

    // New request: advance sequence ID so completions from any older requests are discarded
    const requestId = ++currentRequestId;
    activeUrl = trimmedUrl;
    set({ isAnalyzing: true, error: null });

    const promise = (async () => {
      try {
        const result = await resolveMetadataService().analyze(trimmedUrl);
        // Only apply if this request is still the active one
        if (requestId === currentRequestId) {
          set({ result, isAnalyzing: false, error: null });
          activeUrl = null;
          activePromise = null;
        }
        return result;
      } catch (error) {
        // Only apply error if this request is still the active one
        if (requestId === currentRequestId) {
          set({ error: mapMetadataError(error), isAnalyzing: false, result: null });
          activeUrl = null;
          activePromise = null;
        }
        return null;
      }
    })();

    activePromise = promise;
    return promise;
  },
  clear: () => {
    currentRequestId++;
    activeUrl = null;
    activePromise = null;
    set({ result: null, error: null, isAnalyzing: false });
  }
}));
