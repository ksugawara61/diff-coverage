import { loadConfig } from "./config.js";

export const parseCsv = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const parseCsvOption = (value: string | undefined): string[] =>
  value ? parseCsv(value) : [];

export const mergeExcludePatterns = async (
  cwd: string,
  extras: string[] | undefined,
): Promise<string[]> => {
  const config = await loadConfig(cwd);
  return [...(config.exclude ?? []), ...(extras ?? [])];
};
