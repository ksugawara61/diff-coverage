import {
  access,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

type CoverageProvider = "v8" | "istanbul";
type VitestRunInput = { cwd: string; testCommand?: string };

// node_modules directory bundled with diff-coverage itself
const ownNodeModulesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../node_modules",
);

export async function detectVitestCoverageProvider(
  cwd: string,
): Promise<CoverageProvider | null> {
  for (const provider of ["v8", "istanbul"] as const) {
    try {
      await access(
        join(cwd, "node_modules", "@vitest", `coverage-${provider}`),
      );
      return provider;
    } catch {
      // not installed at this path
    }
  }
  return null;
}

async function withFallbackProvider(
  cwd: string,
  fn: (provider: CoverageProvider) => Promise<void>,
): Promise<void> {
  const projectProvider = await detectVitestCoverageProvider(cwd);
  if (projectProvider) {
    await fn(projectProvider);
    return;
  }

  // Fall back to @vitest/coverage-v8 bundled with diff-coverage itself
  const ownV8Path = join(ownNodeModulesPath, "@vitest", "coverage-v8");
  try {
    await access(ownV8Path);
  } catch {
    throw new Error(
      "No Vitest coverage provider found. Install @vitest/coverage-v8 or @vitest/coverage-istanbul in your project.",
    );
  }

  // Create a temporary symlink in the target project's node_modules so vitest can resolve it
  const vitestDir = join(cwd, "node_modules", "@vitest");
  const symlinkPath = join(vitestDir, "coverage-v8");
  await mkdir(vitestDir, { recursive: true });
  await symlink(ownV8Path, symlinkPath, "dir");
  try {
    await fn("v8");
  } finally {
    await rm(symlinkPath, { force: true, recursive: false });
  }
}

export async function runVitest(
  options: VitestRunInput,
  diffFilePaths: string[],
): Promise<void> {
  const { cwd, testCommand } = options;

  await withFallbackProvider(cwd, async (provider) => {
    const includeArgs = diffFilePaths.flatMap((p) => ["--coverage.include", p]);
    const cmd = testCommand ?? "npx vitest related";
    const usesRelated = cmd.split(" ").includes("related");

    const vitestArgs = [
      "--coverage",
      "--coverage.enabled=true",
      `--coverage.provider=${provider}`,
      "--coverage.reporter=json",
      "--coverage.reporter=json-summary",
      "--coverage.all=false",
      ...includeArgs,
      "--passWithNoTests",
      ...(usesRelated ? diffFilePaths : []),
    ];

    const [bin, ...baseArgs] = cmd.split(" ");

    await execa(bin, [...baseArgs, ...vitestArgs], {
      cwd,
      env: { ...process.env, CI: "true" },
      reject: false,
    });
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
