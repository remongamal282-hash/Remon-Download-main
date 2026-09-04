export function getYouTubeThumbnailFallback(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    let videoId = "";

    if (url.hostname.toLowerCase() === "youtu.be") {
      videoId = url.pathname.slice(1).split("/")[0] ?? "";
    } else {
      const shortsMatch = url.pathname.match(/\/shorts\/([^/?]+)/i);
      const embedMatch = url.pathname.match(/\/embed\/([^/?]+)/i);
      videoId = url.searchParams.get("v") ?? shortsMatch?.[1] ?? embedMatch?.[1] ?? "";
    }

    if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
      return null;
    }

    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  } catch {
    return null;
  }
}
