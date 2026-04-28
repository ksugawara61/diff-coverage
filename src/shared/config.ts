import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type DiffCoverageConfig = {
  exclude?: string[];
};

export const globToRegex = (glob: string): string => {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\?/g, "[^/]")
    .split("**/")
    .map((seg) => seg.split("**").join(".*").split("*").join("[^/]*"))
    .join("(.*/)?");
  return glob.includes("/") ? `^${escaped}($|/)` : `(^|/)${escaped}$`;
};

export const loadConfig = async (cwd: string): Promise<DiffCoverageConfig> => {
  try {
    const raw = await readFile(resolve(cwd, ".diff-coverage.json"), "utf-8");
    return JSON.parse(raw) as DiffCoverageConfig;
  } catch {
    return {};
  }
};
