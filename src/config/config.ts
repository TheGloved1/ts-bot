import { Config } from "./configSchema";

const fetchConfig = async () => {
  const response = await fetch("./config.json");
  const data = await response.json();
  const result = Config.safeParse(data);
  if (!result.success) {
    const error = result.error.flatten();
    const issues = error.formErrors.join("\n");
    throw new Error(`Config file is invalid: ${issues}`);
  }
  return result.data;
};

export const config = await fetchConfig();
