import { z } from "zod";

export const configSchema = z.object({
  bot: z.object({
    NAME: z.string(),
    TOKEN: z.string(),
    OWNER_ID: z.string(),
    GEMINI_KEY: z.string(),
  }),
});

export const Config = configSchema;
