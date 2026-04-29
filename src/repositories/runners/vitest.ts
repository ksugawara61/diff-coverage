import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execa } from "execa";

type VitestRunInput = { cwd: string; testCommand?: string };

export async function runVitest(
  options: VitestRunInput,
  diffFilePaths: string[],
): Promise<void> {
  const { cwd, testCommand } = options;

  const includeArgs = diffFilePaths.flatMap((p) => ["--coverage.include", p]);

  const vitestArgs = [
    "run",
    "--coverage",
    "--coverage.enabled=true",
    "--coverage.provider=v8",
    "--coverage.reporter=json",
    "--coverage.reporter=json-summary",
    "--coverage.all=false",
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

  await normalizeVitestCoverage(cwd);
}

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
