import { loadConfig } from "../core.js";

export const parseCsv = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const parseCsvOption = (value: string | undefined): string[] =>
  value ? parseCsv(value) : [];

export const resolveExcludePatterns = async (
  cwd: string,
  excludeOption: string | undefined,
): Promise<string[]> => {
  const config = await loadConfig(cwd);
  return [...(config.exclude ?? []), ...parseCsvOption(excludeOption)];
};
