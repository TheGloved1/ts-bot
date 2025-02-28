import { z } from "zod";
import * as fs from "fs";

const configSchema = z.object({
  NAME: z.string(),
  TOKEN: z.string(),
  OWNER_ID: z.string(),
  GEMINI_KEY: z.string(),
});

const fetchConfig = async () => {
  const response = fs.readFileSync("config.json", "utf8");
  const data = JSON.parse(response);
  const result = configSchema.safeParse(data);
  if (!result.success) {
    const error = result.error.flatten();
    const issues = error.fieldErrors;
    throw new Error(`Config file is invalid: ${JSON.stringify(issues, null, 2)}`);
  }
  return result.data;
};

export const config = await fetchConfig();
