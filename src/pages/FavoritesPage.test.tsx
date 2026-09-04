import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import "../i18n";
import { FavoritesPage } from "./FavoritesPage";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useQueueStore } from "../stores/queueStore";
import type { FavoriteItem } from "../types/download";

const favorite: FavoriteItem = {
  id: "favorite-page",
  sourceUrl: "https://www.youtube.com/watch?v=favorite-page",
  thumbnail: "https://example.com/favorite.jpg",
  title: "Favorite Page Video",
  channel: "Favorite Channel",
  dateAdded: "2026-08-14T08:00:00.000Z"
};

describe("FavoritesPage", () => {
  beforeEach(async () => {
    await useFavoritesStore.getState().resetForTests();
    useQueueStore.getState().clear();
  });

  it("renders a loading state while favorites are fetched", () => {
    const originalLoad = useFavoritesStore.getState().load;
    useFavoritesStore.setState({ isLoading: true, load: async () => undefined });

    const { unmount } = render(<FavoritesPage />);

    expect(screen.getByLabelText("Loading favorites")).toBeInTheDocument();
    unmount();
    useFavoritesStore.setState({ load: originalLoad, isLoading: false });
  });

  it("renders an accessible empty state", async () => {
    render(<FavoritesPage />);

    expect(await screen.findByText("No favorites yet")).toBeInTheDocument();
    expect(screen.getByText("Favorite videos will appear here for quick downloading.")).toBeInTheDocument();
  });

  it("renders favorite item details", async () => {
    await useFavoritesStore.getState().add(favorite);

    render(<FavoritesPage />);

    expect(await screen.findByText("Favorite Page Video")).toBeInTheDocument();
    expect(screen.getByText("Favorite Channel")).toBeInTheDocument();
    expect(screen.getByText(favorite.sourceUrl)).toBeInTheDocument();
  });

  it("supports download and remove interactions", async () => {
    await useFavoritesStore.getState().add(favorite);
    const user = userEvent.setup();

    render(<FavoritesPage />);

    const row = await screen.findByRole("listitem");
    await user.click(within(row).getByRole("button", { name: "Download" }));
    expect(useQueueStore.getState().items[0]).toMatchObject({
      title: favorite.title,
      sourceUrl: favorite.sourceUrl,
      status: "queued"
    });

    await user.keyboard("{Tab}");
    await user.click(within(row).getByRole("button", { name: "Remove favorite" }));
    await waitFor(() => expect(screen.queryByText("Favorite Page Video")).not.toBeInTheDocument());
    expect(await screen.findByText("No favorites yet")).toBeInTheDocument();
  });
});
