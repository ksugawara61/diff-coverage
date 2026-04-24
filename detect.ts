import { access } from "node:fs/promises";
import { resolve } from "node:path";

export type RunnerType = "jest" | "vitest";

const VITEST_CONFIG_FILES = [
  "vitest.config.ts",
  "vitest.config.mts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vite.config.ts",   // vitest can live inside vite config
  "vite.config.mts",
  "vite.config.js",
];

const JEST_CONFIG_FILES = [
  "jest.config.ts",
  "jest.config.mts",
  "jest.config.js",
  "jest.config.cjs",
  "jest.config.mjs",
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect which test runner is configured in the project.
 *
 * Priority:
 * 1. Explicit vitest config file  → vitest
 * 2. Explicit jest config file    → jest
 * 3. package.json "jest" key      → jest
 * 4. package.json "scripts" containing "vitest" → vitest
 * 5. Fall back to jest
 */
export async function detectRunner(cwd: string): Promise<RunnerType> {
  // Check vitest config files first (more specific wins)
  for (const cfg of VITEST_CONFIG_FILES) {
    if (await fileExists(resolve(cwd, cfg))) {
      // vite.config.* might not have vitest configured — peek inside
      if (cfg.startsWith("vite.config")) {
        try {
          const { readFile } = await import("node:fs/promises");
          const content = await readFile(resolve(cwd, cfg), "utf-8");
          if (content.includes("vitest") || content.includes("test:")) {
            return "vitest";
          }
        } catch {
          // can't read — skip
        }
      } else {
        return "vitest";
      }
    }
  }

  // Check jest config files
  for (const cfg of JEST_CONFIG_FILES) {
    if (await fileExists(resolve(cwd, cfg))) {
      return "jest";
    }
  }

  // Check package.json
  try {
    const { readFile } = await import("node:fs/promises");
    const pkgRaw = await readFile(resolve(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw);

    if (pkg.jest) return "jest";

    const scripts: Record<string, string> = pkg.scripts ?? {};
    const allScripts = Object.values(scripts).join(" ");
    if (allScripts.includes("vitest")) return "vitest";
    if (allScripts.includes("jest")) return "jest";

    // Check devDependencies / dependencies
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    if (deps?.vitest) return "vitest";
    if (deps?.jest) return "jest";
  } catch {
    // no package.json or parse error
  }

  return "jest"; // default
}
