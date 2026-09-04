import { z } from "zod";

export const quickAddSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "validation.emptyUrl")
    .url("validation.invalidUrl")
});

export type QuickAddFormValues = z.infer<typeof quickAddSchema>;

export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(
      parsed.hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}
