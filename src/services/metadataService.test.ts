import { describe, expect, it } from "vitest";
import { MockMetadataService } from "./metadataService";

const service = new MockMetadataService();

describe("MockMetadataService", () => {
  it("analyzes a video URL", async () => {
    const result = await service.analyze("https://www.youtube.com/watch?v=abc");
    expect(result.linkType).toBe("video");
  });

  it("analyzes a shorts URL", async () => {
    const result = await service.analyze("https://www.youtube.com/shorts/abc");
    expect(result.linkType).toBe("shorts");
  });

  it("analyzes a playlist URL", async () => {
    const result = await service.analyze("https://www.youtube.com/playlist?list=abc");
    expect(result.linkType).toBe("playlist");
    if (result.linkType === "playlist") {
      expect(result.videos.length).toBeGreaterThan(0);
    }
  });

  it("analyzes a video inside playlist URL", async () => {
    const result = await service.analyze("https://www.youtube.com/watch?v=abc&list=playlist");
    expect(result.linkType).toBe("playlist-video");
  });

  it("analyzes a channel URL", async () => {
    const result = await service.analyze("https://www.youtube.com/@example");
    expect(result.linkType).toBe("channel");
    if (result.linkType === "channel") {
      expect(result.latestVideos.length).toBeGreaterThan(0);
    }
  });

  it("rejects unsupported URLs", async () => {
    await expect(service.analyze("https://example.com/watch?v=abc")).rejects.toThrow("unsupported_url");
  });
});
