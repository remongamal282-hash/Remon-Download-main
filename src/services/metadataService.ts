import type { AnalysisResult, ChannelMetadata, LinkType, PlaylistMetadata, VideoLinkType, VideoMetadata } from "../types/download";
import { isYouTubeUrl } from "../utils/urlValidation";

export interface MetadataService {
  analyze(url: string): Promise<AnalysisResult>;
}

function inferLinkType(url: string): LinkType {
  const parsed = new URL(url);
  const pathname = parsed.pathname.toLowerCase();

  if (pathname.includes("/shorts/")) {
    return "shorts";
  }

  if (pathname.includes("/channel/") || pathname.includes("/@")) {
    return "channel";
  }

  if (parsed.searchParams.has("list") && parsed.searchParams.has("v")) {
    return "playlist-video";
  }

  if (parsed.searchParams.has("list")) {
    return "playlist";
  }

  return "video";
}

function createVideo(url: string, index = 1, linkType: VideoLinkType = "video"): VideoMetadata {
  return {
    id: `mock-video-${linkType}-${index}`,
    sourceUrl: url,
    linkType,
    thumbnail: `https://picsum.photos/seed/remon-${linkType}-${index}/320/180`,
    title: index === 1 ? "Amazing Nature Documentary" : `Playlist Clip ${index}`,
    channelName: "Example Channel",
    duration: index === 1 ? "12:48" : `0${index + 2}:2${index}`,
    views: 1240000 + index * 13000,
    qualityOptions: ["2160p", "1440p", "1080p", "720p", "480p"],
    videoFormats: ["mp4", "webm", "mkv"],
    audioFormats: ["mp3", "opus"],
    resolution: "1080p",
    fps: 60,
    videoCodec: "H.264",
    audioCodec: "AAC",
    videoBitrate: "8.2 Mbps",
    audioBitrate: "192 Kbps",
    container: "mp4",
    fileSize: 260 * 1024 * 1024 + index * 1024 * 1024,
    uploadDate: "2026-08-01"
  };
}

function createPlaylist(url: string): PlaylistMetadata {
  return {
    id: "mock-playlist-1",
    sourceUrl: url,
    linkType: "playlist",
    title: "Creator Picks Playlist",
    thumbnail: "https://picsum.photos/seed/remon-playlist/320/180",
    videos: Array.from({ length: 5 }, (_, index) => createVideo(url, index + 1, "playlist-video"))
  };
}

function createChannel(url: string): ChannelMetadata {
  return {
    id: "mock-channel-1",
    sourceUrl: url,
    linkType: "channel",
    name: "Example Channel",
    thumbnail: "https://picsum.photos/seed/remon-channel/160/160",
    mockVideoCount: 128,
    latestVideos: Array.from({ length: 4 }, (_, index) => createVideo(url, index + 1, "video"))
  };
}

export class MockMetadataService implements MetadataService {
  async analyze(url: string): Promise<AnalysisResult> {
    await new Promise((resolve) => window.setTimeout(resolve, 350));

    if (!isYouTubeUrl(url)) {
      throw new Error("unsupported_url");
    }

    const linkType = inferLinkType(url);

    if (linkType === "playlist") {
      return createPlaylist(url);
    }

    if (linkType === "channel") {
      return createChannel(url);
    }

    return createVideo(url, 1, linkType);
  }
}

export const metadataService: MetadataService = new MockMetadataService();
