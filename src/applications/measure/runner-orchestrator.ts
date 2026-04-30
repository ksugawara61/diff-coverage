import {
  readCoverageFinal,
  readCoverageSummary,
} from "../../repositories/coverage-files.js";
import type { DiffFile } from "../../repositories/git.js";
import { detectRunner } from "../../repositories/runners/detect.js";
import { runJest } from "../../repositories/runners/jest.js";
import { runVitest } from "../../repositories/runners/vitest.js";
import {
  buildCoverageResult,
  computeFileCoverages,
  type DiffCoverageResult,
  emptyResult,
  type RunOptions,
} from "./coverage.js";

const resolveRunner = async (
  options: RunOptions,
): Promise<"jest" | "vitest"> => {
  const { runner = "auto", cwd, testCommand } = options;
  if (runner !== "auto") return runner;
  if (testCommand?.includes("vitest")) return "vitest";
  if (testCommand?.includes("jest")) return "jest";
  return detectRunner(cwd);
};

export const runCoverage = async (
  options: RunOptions,
  diffFiles: DiffFile[],
): Promise<DiffCoverageResult> => {
  const { cwd } = options;

  if (diffFiles.length === 0) {
    const runner = await resolveRunner(options);
    return emptyResult(runner);
  }

  const runner = await resolveRunner(options);
  const filePaths = diffFiles.map((f) => f.path);

  if (runner === "vitest") {
    await runVitest({ cwd, testCommand: options.testCommand }, filePaths);
  } else {
    await runJest({ cwd, testCommand: options.testCommand }, filePaths);
  }

  let summaryData = {};
  let detailData = {};

  try {
    summaryData = await readCoverageSummary(cwd);
  } catch {
    return emptyResult(runner);
  }

  try {
    detailData = await readCoverageFinal(cwd);
  } catch {
    // detail report is optional
  }

  const { files, uncoveredFiles, totals } = computeFileCoverages(
    summaryData,
    detailData,
    cwd,
    diffFiles,
  );

  return buildCoverageResult(files, uncoveredFiles, totals, runner);
};
