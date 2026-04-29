import { loadConfig } from "../../repositories/config-file.js";
import { globToRegex } from "./glob.js";

export const mergeExcludePatterns = async (
  cwd: string,
  extras: string[] | undefined,
): Promise<string[]> => {
  const config = await loadConfig(cwd);
  return [...(config.exclude ?? []), ...(extras ?? [])].map(globToRegex);
};
