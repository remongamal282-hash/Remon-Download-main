import { beforeEach, describe, expect, it } from "vitest";
import type { FavoriteItem } from "../types/download";
import { useFavoritesStore } from "./favoritesStore";
import { useQueueStore } from "./queueStore";

const favorite: FavoriteItem = {
  id: "favorite-store",
  sourceUrl: "https://www.youtube.com/watch?v=favorite-store",
  thumbnail: "https://example.com/favorite.jpg",
  title: "Favorite Store Video",
  channel: "Favorite Channel",
  dateAdded: "2026-08-14T08:00:00.000Z"
};

describe("useFavoritesStore", () => {
  beforeEach(async () => {
    await useFavoritesStore.getState().resetForTests();
    useQueueStore.getState().clear();
  });

  it("loads favorites from the service", async () => {
    await useFavoritesStore.getState().add(favorite);
    useFavoritesStore.setState({ items: [] });

    await useFavoritesStore.getState().load();

    expect(useFavoritesStore.getState().items).toEqual([favorite]);
    expect(useFavoritesStore.getState().isLoading).toBe(false);
  });

  it("adds, checks, and removes a favorite", async () => {
    await useFavoritesStore.getState().add(favorite);

    expect(await useFavoritesStore.getState().isFavorite(favorite.sourceUrl)).toBe(true);

    await useFavoritesStore.getState().remove(favorite.id);
    expect(useFavoritesStore.getState().items).toEqual([]);
  });

  it("downloads a favorite into the queue without starting it", async () => {
    await useFavoritesStore.getState().add(favorite);

    const result = useFavoritesStore.getState().download(favorite.id, "1080p", "mp4");

    expect(result).toBe(true);
    expect(useQueueStore.getState().items[0]).toMatchObject({
      title: favorite.title,
      sourceUrl: favorite.sourceUrl,
      thumbnail: favorite.thumbnail,
      quality: "1080p",
      format: "mp4",
      status: "queued"
    });
  });

  it("maps service errors into store error state", async () => {
    useFavoritesStore.getState().failNext({ code: "network_error", message: "errors.networkError", recoverable: true });

    await useFavoritesStore.getState().load();

    expect(useFavoritesStore.getState().error).toMatchObject({ code: "network_error" });
    expect(useFavoritesStore.getState().isLoading).toBe(false);
  });

  it("reports missing download items", () => {
    expect(useFavoritesStore.getState().download("missing", "1080p", "mp4")).toBe(false);
    expect(useFavoritesStore.getState().error?.message).toBe("favorites.errors.notFound");
  });
});
