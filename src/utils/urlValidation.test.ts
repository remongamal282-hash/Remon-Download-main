import { describe, expect, it } from "vitest";
import { isYouTubeUrl, quickAddSchema } from "./urlValidation";

describe("quickAddSchema", () => {
  it("rejects empty URLs", () => {
    const result = quickAddSchema.safeParse({ url: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid URLs", () => {
    const result = quickAddSchema.safeParse({ url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("accepts valid URL syntax", () => {
    const result = quickAddSchema.safeParse({ url: "https://example.com/video" });
    expect(result.success).toBe(true);
  });
});

describe("isYouTubeUrl", () => {
  it("detects supported YouTube hosts", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
  });

  it("rejects non-YouTube hosts", () => {
    expect(isYouTubeUrl("https://example.com/watch?v=abc")).toBe(false);
  });
});
