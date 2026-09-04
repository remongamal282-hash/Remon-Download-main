import { z } from "zod";
import { isYouTubeUrl } from "./urlValidation";

export const schedulerSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "validation.emptyUrl")
    .url("validation.invalidUrl")
    .refine(isYouTubeUrl, "errors.unsupportedUrl"),
  date: z.string().min(1, "scheduler.validation.dateRequired"),
  time: z.string().min(1, "scheduler.validation.timeRequired"),
  repeat: z.enum(["once", "daily", "weekly"])
});

export type SchedulerFormValues = z.infer<typeof schedulerSchema>;
