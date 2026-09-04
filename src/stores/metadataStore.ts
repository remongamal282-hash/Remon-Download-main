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

function mapMetadataError(error: unknown): ErrorModel {
  if (error instanceof Error && error.message === "unsupported_url") {
    return {
      code: "unsupported_url",
      message: "errors.unsupportedUrl",
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
    if (get().isAnalyzing) {
      return null;
    }

    set({ isAnalyzing: true, error: null });

    try {
      const result = await resolveMetadataService().analyze(url);
      set({ result, isAnalyzing: false });
      return result;
    } catch (error) {
      set({ error: mapMetadataError(error), isAnalyzing: false, result: null });
      return null;
    }
  },
  clear: () => set({ result: null, error: null, isAnalyzing: false })
}));
