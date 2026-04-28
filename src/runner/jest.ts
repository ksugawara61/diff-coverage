import { execa } from "execa";
import type { RunOptions } from "../shared/coverage.js";
import type { DiffFile } from "../shared/diff.js";

export const runJest = async (
  options: RunOptions,
  diffFiles: DiffFile[],
): Promise<void> => {
  const { cwd, testCommand } = options;
  const filePaths = diffFiles.map((f) => f.path);

  const jestArgs = [
    "--coverage",
    ...filePaths.map((p) => `--collectCoverageFrom=${p}`),
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
};
