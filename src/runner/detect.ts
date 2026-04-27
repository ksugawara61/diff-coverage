import { access } from "node:fs/promises";
import { resolve } from "node:path";

export type RunnerType = "jest" | "vitest";

const VITEST_CONFIG_FILES = [
  "vitest.config.ts",
  "vitest.config.mts",
  "vitest.config.js",
  "vitest.config.mjs",
  "vite.config.ts", // vitest can live inside vite config
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

async function checkViteConfig(cfgPath: string): Promise<boolean> {
  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(cfgPath, "utf-8");
    return content.includes("vitest") || content.includes("test:");
  } catch {
    return false;
  }
}

async function checkVitestConfigs(cwd: string): Promise<RunnerType | null> {
  for (const cfg of VITEST_CONFIG_FILES) {
    if (!(await fileExists(resolve(cwd, cfg)))) continue;
    if (cfg.startsWith("vite.config")) {
      if (await checkViteConfig(resolve(cwd, cfg))) return "vitest";
    } else {
      return "vitest";
    }
  }
  return null;
}

async function checkJestConfigs(cwd: string): Promise<RunnerType | null> {
  for (const cfg of JEST_CONFIG_FILES) {
    if (await fileExists(resolve(cwd, cfg))) return "jest";
  }
  return null;
}

async function checkPackageJson(cwd: string): Promise<RunnerType | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const pkgRaw = await readFile(resolve(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw);

    if (pkg.jest) return "jest";

    const scripts: Record<string, string> = pkg.scripts ?? {};
    const allScripts = Object.values(scripts).join(" ");
    if (allScripts.includes("vitest")) return "vitest";
    if (allScripts.includes("jest")) return "jest";

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps?.vitest) return "vitest";
    if (deps?.jest) return "jest";
  } catch {
    // no package.json or parse error
  }
  return null;
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
  return (
    (await checkVitestConfigs(cwd)) ??
    (await checkJestConfigs(cwd)) ??
    (await checkPackageJson(cwd)) ??
    "jest"
  );
}
