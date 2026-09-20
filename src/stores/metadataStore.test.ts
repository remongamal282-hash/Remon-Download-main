import { beforeEach, describe, expect, it } from "vitest";
import { useMetadataStore, mapMetadataError } from "./metadataStore";
import { _injectMetadataService, _resetServiceCache } from "../services/serviceResolver";
import type { MetadataService } from "../services/metadataService";
import type { AnalysisResult, VideoMetadata } from "../types/download";

describe("useMetadataStore", () => {
  beforeEach(() => {
    _resetServiceCache();
    useMetadataStore.getState().clear();
  });

  it("reuses in-flight promise when analyze is called concurrently with the same URL", async () => {
    const fakeResult: AnalysisResult = {
      id: "video-1",
      sourceUrl: "https://www.youtube.com/watch?v=same123",
      linkType: "video",
      thumbnail: "",
      title: "Same Video",
      channelName: "Test Channel",
      duration: "3:00",
      views: 100,
      qualityOptions: ["1080p"],
      videoFormats: ["mp4"],
      audioFormats: ["mp3"],
      resolution: "1080p",
      fps: 30,
      videoCodec: "h264",
      audioCodec: "aac",
      videoBitrate: "2 Mbps",
      audioBitrate: "128 kbps",
      container: "mp4",
      fileSize: 1000,
      uploadDate: "2026-01-01"
    };

    let callCount = 0;
    const mockService: MetadataService = {
      analyze: async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 50));
        return fakeResult;
      }
    };
    _injectMetadataService(mockService);

    const promise1 = useMetadataStore.getState().analyze("https://www.youtube.com/watch?v=same123");
    const promise2 = useMetadataStore.getState().analyze("https://www.youtube.com/watch?v=same123");

    // Both promises should resolve to the same result
    const [res1, res2] = (await Promise.all([promise1, promise2])) as [VideoMetadata, VideoMetadata];
    expect(res1?.title).toBe("Same Video");
    expect(res2?.title).toBe("Same Video");
    expect(callCount).toBe(1); // Exactly 1 service call triggered
  });

  it("URL changed during analysis: old obsolete request cannot overwrite new request", async () => {
    const videoA: AnalysisResult = {
      id: "video-a",
      sourceUrl: "https://www.youtube.com/watch?v=videoA",
      linkType: "video",
      thumbnail: "",
      title: "Video A",
      channelName: "Test",
      duration: "1:00",
      views: 10,
      qualityOptions: ["720p"],
      videoFormats: ["mp4"],
      audioFormats: ["mp3"],
      resolution: "720p",
      fps: 30,
      videoCodec: "h264",
      audioCodec: "aac",
      videoBitrate: "1 Mbps",
      audioBitrate: "128 kbps",
      container: "mp4",
      fileSize: 500,
      uploadDate: "2026-01-01"
    };

    const videoB: AnalysisResult = {
      id: "video-b",
      sourceUrl: "https://www.youtube.com/watch?v=videoB",
      linkType: "video",
      thumbnail: "",
      title: "Video B",
      channelName: "Test",
      duration: "2:00",
      views: 20,
      qualityOptions: ["1080p"],
      videoFormats: ["mp4"],
      audioFormats: ["mp3"],
      resolution: "1080p",
      fps: 30,
      videoCodec: "h264",
      audioCodec: "aac",
      videoBitrate: "2 Mbps",
      audioBitrate: "128 kbps",
      container: "mp4",
      fileSize: 1000,
      uploadDate: "2026-01-01"
    };

    const mockService: MetadataService = {
      analyze: async (url: string) => {
        if (url.includes("videoA")) {
          // A is slower (100ms)
          await new Promise((r) => setTimeout(r, 100));
          return videoA;
        } else {
          // B is faster (20ms)
          await new Promise((r) => setTimeout(r, 20));
          return videoB;
        }
      }
    };
    _injectMetadataService(mockService);

    // User pastes URL A
    const reqA = useMetadataStore.getState().analyze("https://www.youtube.com/watch?v=videoA");
    // While A is in flight, user changes URL to B
    const reqB = useMetadataStore.getState().analyze("https://www.youtube.com/watch?v=videoB");

    // Wait for B to finish first
    await reqB;
    expect((useMetadataStore.getState().result as VideoMetadata)?.title).toBe("Video B");

    // Wait for A to finish afterwards: it must NOT overwrite B!
    await reqA;
    expect((useMetadataStore.getState().result as VideoMetadata)?.title).toBe("Video B");
    expect(useMetadataStore.getState().error).toBeNull();
  });

  it("maps error messages accurately", () => {
    expect(mapMetadataError(new Error("unsupported_url")).code).toBe("unsupported_url");
    expect(mapMetadataError(new Error("ytdlp_timeout")).code).toBe("timeout");
    expect(mapMetadataError(new Error("video_private")).code).toBe("video_private");
    expect(mapMetadataError(new Error("video_unavailable")).code).toBe("video_unavailable");
    expect(mapMetadataError(new Error("network_error")).code).toBe("network_error");
    expect(mapMetadataError(new Error("ytdlp_failed")).code).toBe("ytdlp_error");
    expect(mapMetadataError(new Error("something_else")).code).toBe("unknown");
  });

  it("clear cancels active request and resets state", () => {
    useMetadataStore.setState({ isAnalyzing: true, result: null, error: null });
    useMetadataStore.getState().clear();
    const state = useMetadataStore.getState();
    expect(state.isAnalyzing).toBe(false);
    expect(state.result).toBeNull();
    expect(state.error).toBeNull();
  });
});

