import { describe, expect, it } from "vitest";
import type { FavoriteItem } from "../types/download";
import { MockFavoritesService } from "./favoritesService";

const favorite: FavoriteItem = {
  id: "favorite-test",
  sourceUrl: "https://www.youtube.com/watch?v=favorite-test",
  thumbnail: "https://example.com/favorite.jpg",
  title: "Favorite Test Video",
  channel: "Favorite Channel",
  dateAdded: "2026-08-14T08:00:00.000Z"
};

describe("MockFavoritesService", () => {
  it("loads initial mock favorites", async () => {
    const service = new MockFavoritesService();

    const items = await service.getAll();

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveProperty("channel");
  });

  it("adds favorites and reports favorite status by source URL", async () => {
    const service = new MockFavoritesService();

    await service.add(favorite);

    expect(await service.isFavorite(favorite.sourceUrl)).toBe(true);
  });

  it("removes and clears favorites", async () => {
    const service = new MockFavoritesService();

    await service.add(favorite);
    await service.remove(favorite.id);
    expect(await service.isFavorite(favorite.sourceUrl)).toBe(false);

    await service.add(favorite);
    await service.clear();
    expect(await service.getAll()).toEqual([]);
  });

  it("supports one-shot mock errors", async () => {
    const service = new MockFavoritesService();
    service.failNext({ code: "network_error", message: "errors.networkError", recoverable: true });

    await expect(service.getAll()).rejects.toMatchObject({ code: "network_error" });
    await expect(service.getAll()).resolves.toEqual(expect.any(Array));
  });
});
