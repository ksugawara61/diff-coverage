import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execa } from "execa";
import type { DiffFile, RunOptions } from "../core.js";

// Vitest outputs coverage to coverage/ by default, same as Jest.
// But the include pattern syntax differs: Vitest uses glob patterns passed via
// --coverage.include, and does NOT support --findRelatedTests.
// We run all tests but restrict coverage collection to diff files only.
export async function runVitest(
  options: RunOptions,
  diffFiles: DiffFile[],
): Promise<void> {
  const { cwd, testCommand } = options;
  const filePaths = diffFiles.map((f) => f.path);

  // Build --coverage.include args (one per file)
  const includeArgs = filePaths.flatMap((p) => ["--coverage.include", p]);

  const vitestArgs = [
    "run",
    "--coverage",
    "--coverage.enabled=true",
    "--coverage.provider=v8", // v8 is faster; istanbul also works
    "--coverage.reporter=json",
    "--coverage.reporter=json-summary",
    "--coverage.all=false", // only instrument files that are imported
    ...includeArgs,
    "--passWithNoTests",
  ];

  const cmd = testCommand ?? "npx vitest";
  const [bin, ...baseArgs] = cmd.split(" ");

  await execa(bin, [...baseArgs, ...vitestArgs], {
    cwd,
    env: { ...process.env, CI: "true" },
    reject: false,
  });

  // Vitest with v8 provider may output coverage-final.json in a slightly
  // different shape for the file keys — normalize them so parseCoverageReport
  // can handle both Jest and Vitest output identically.
  await normalizeVitestCoverage(cwd);
}

// Vitest v8 sometimes writes relative paths as keys instead of absolute paths.
// Normalize to absolute paths to match Jest's output format.
async function normalizeCoverageFile(
  filePath: string,
  cwd: string,
  preserveKey?: (key: string) => boolean,
): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return;
  }

  const data: Record<string, unknown> = JSON.parse(raw);
  const normalized: Record<string, unknown> = {};
  let changed = false;

  for (const [key, value] of Object.entries(data)) {
    if (preserveKey?.(key) || key.startsWith("/") || key.match(/^[A-Z]:\\/)) {
      normalized[key] = value;
    } else {
      normalized[resolve(cwd, key)] = value;
      changed = true;
    }
  }

  if (changed) {
    await writeFile(filePath, JSON.stringify(normalized), "utf-8");
  }
}

async function normalizeVitestCoverage(cwd: string): Promise<void> {
  const finalPath = resolve(cwd, "coverage/coverage-final.json");
  const summaryPath = resolve(cwd, "coverage/coverage-summary.json");

  await normalizeCoverageFile(finalPath, cwd);
  await normalizeCoverageFile(summaryPath, cwd, (key) => key === "total");
}

export const VITEST_COVERAGE_DIR = "coverage";
