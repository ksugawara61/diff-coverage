import { execa } from "execa";
import type { DiffFile, RunOptions } from "../core.js";

export async function runJest(
  options: RunOptions,
  diffFiles: DiffFile[]
): Promise<void> {
  const { cwd, testCommand, extensions } = options;
  const filePaths = diffFiles.map((f) => f.path);

  const jestArgs = [
    "--coverage",
    `--collectCoverageFrom=${filePaths.join(",")}`,
    "--coverageReporters=json-summary",
    "--coverageReporters=json",
    "--passWithNoTests",
    "--findRelatedTests",
    ...filePaths,
  ];

  const cmd = testCommand ?? "npx jest";
  const [bin, ...baseArgs] = cmd.split(" ");

  await execa(bin, [...baseArgs, ...jestArgs], {
    cwd,
    env: { ...process.env, CI: "true" },
    reject: false,
  });
}

// Jest outputs to coverage/ by default
export const JEST_COVERAGE_DIR = "coverage";
