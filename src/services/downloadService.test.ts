import { describe, expect, it } from "vitest";
import type { FavoriteItem, VideoMetadata } from "../types/download";
import { MockDownloadService } from "./downloadService";

const metadata: VideoMetadata = {
  id: "video-1",
  sourceUrl: "https://www.youtube.com/watch?v=abc",
  linkType: "video",
  thumbnail: "https://example.com/thumb.jpg",
  title: "Test Video",
  channelName: "Test Channel",
  duration: "10:00",
  views: 100,
  qualityOptions: ["1080p"],
  videoFormats: ["mp4"],
  audioFormats: ["m4a"],
  resolution: "1080p",
  fps: 60,
  videoCodec: "H.264",
  audioCodec: "AAC",
  videoBitrate: "8 Mbps",
  audioBitrate: "192 Kbps",
  container: "mp4",
  fileSize: 1024 * 1024,
  uploadDate: "2026-08-01"
};

const favorite: FavoriteItem = {
  id: "favorite-1",
  sourceUrl: "https://www.youtube.com/watch?v=favorite",
  thumbnail: "https://example.com/favorite.jpg",
  title: "Favorite Video",
  channel: "Favorite Channel",
  dateAdded: "2026-08-14T08:00:00.000Z"
};

describe("MockDownloadService", () => {
  it("follows the normal lifecycle", () => {
    const service = new MockDownloadService();
    let item = service.createFromMetadata(metadata, 1, "1080p", "mp4");

    item = service.transition(item, "analyzing", 1000);
    item = service.tick(item, 1700, "unlimited");
    expect(item.status).toBe("downloading");

    item = service.tick(item, 9000, "unlimited");
    expect(item.status).toBe("merging");

    item = service.tick(item, 9800, "unlimited");
    expect(item.status).toBe("converting");

    item = service.tick(item, 10600, "unlimited");
    expect(item.status).toBe("completed");
    expect(item.progress).toBe(100);
  });

  it("pauses, resumes, and retries according to the state machine", () => {
    const service = new MockDownloadService();
    let item = service.createFromMetadata(metadata, 1, "1080p", "mp4");
    item = service.transition(item, "analyzing", 1000);
    item = service.transition(item, "downloading", 1100);
    item = service.transition(item, "paused", 1200);
    expect(item.status).toBe("paused");

    item = service.transition(item, "downloading", 1300);
    expect(item.status).toBe("downloading");

    item = service.fail(item, { code: "network_error", message: "errors.networkError", recoverable: true }, 1400);
    item = service.retry(item, 1500);
    expect(item.status).toBe("retrying");
    expect(item.progress).toBe(0);
    expect(item.retryCount).toBe(1);
  });

  it("applies speed limits to simulated speed", () => {
    const service = new MockDownloadService();
    let item = service.createFromMetadata(metadata, 1, "1080p", "mp4");
    item = service.transition(item, "analyzing", 1000);
    item = service.transition(item, "downloading", 1100);
    item = service.tick(item, 1800, 500 * 1024);

    expect(item.speed).toBeLessThanOrEqual(500 * 1024);
  });

  it("creates queued download items from favorites", () => {
    const service = new MockDownloadService();
    const item = service.createFromFavoriteItem(favorite, 2, "720p", "webm");

    expect(item).toMatchObject({
      metadataId: favorite.id,
      title: favorite.title,
      sourceUrl: favorite.sourceUrl,
      thumbnail: favorite.thumbnail,
      quality: "720p",
      format: "webm",
      status: "queued",
      order: 2
    });
    expect(item.fileSize).toBeGreaterThan(0);
  });
});
