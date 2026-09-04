import { beforeEach, describe, expect, it } from "vitest";
import { useMetadataStore } from "./metadataStore";

describe("useMetadataStore", () => {
  beforeEach(() => {
    useMetadataStore.getState().clear();
  });

  it("prevents double analyze while a request is active", async () => {
    const first = useMetadataStore.getState().analyze("https://www.youtube.com/watch?v=abc");
    const second = await useMetadataStore.getState().analyze("https://www.youtube.com/watch?v=def");

    expect(second).toBeNull();
    await first;
    expect(useMetadataStore.getState().result?.sourceUrl).toBe("https://www.youtube.com/watch?v=abc");
  });
});
