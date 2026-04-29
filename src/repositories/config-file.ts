import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type DiffCoverageConfig = {
  exclude?: string[];
};

export const loadConfig = async (cwd: string): Promise<DiffCoverageConfig> => {
  try {
    const raw = await readFile(resolve(cwd, ".diff-coverage.json"), "utf-8");
    return JSON.parse(raw) as DiffCoverageConfig;
  } catch {
    return {};
  }
};
