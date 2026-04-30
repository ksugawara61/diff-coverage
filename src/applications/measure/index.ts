import { relative } from "node:path";
import { loadConfig } from "../../repositories/config-file.js";
import type { DiffFile } from "../../repositories/git.js";
import { getDiffFiles } from "../../repositories/git.js";
import { remapDiffFilePaths } from "../../repositories/monorepo.js";
import { globToRegex } from "../shared/glob.js";
import type { DiffCoverageResult, RunOptions } from "./coverage.js";
import { runCoverage } from "./runner-orchestrator.js";

export type MeasureOptions = {
  base?: string;
  cwd: string;
  exclude?: string[];
  extensions?: string[];
  runner?: RunOptions["runner"];
  testCommand?: string;
  threshold?: number;
};

export type MeasureOutcome = {
  coverage: DiffCoverageResult;
  diffFiles: DiffFile[];
  thresholdMet: boolean | null;
};

export const computeThresholdMet = (
  result: DiffCoverageResult,
  threshold?: number,
): boolean | null => {
  if (threshold === undefined) return null;
  return result.summary.lines.pct >= threshold;
};

export const resolveMeasureDiffFiles = async (opts: {
  base?: string;
  cwd: string;
  exclude?: string[];
  extensions?: string[];
}): Promise<DiffFile[]> => {
  const config = await loadConfig(opts.cwd);
  const extraExcludePatterns = [
    ...(config.exclude ?? []),
    ...(opts.exclude ?? []),
  ].map(globToRegex);
  return getDiffFiles(
    opts.cwd,
    opts.base,
    opts.extensions,
    undefined,
    extraExcludePatterns,
  );
};

export const measureWithDiffFiles = async (
  opts: MeasureOptions,
  diffFiles: DiffFile[],
): Promise<MeasureOutcome> => {
  const coverage = await runCoverage(
    {
      base: opts.base,
      cwd: opts.cwd,
      extensions: opts.extensions,
      runner: opts.runner,
      testCommand: opts.testCommand,
    },
    diffFiles,
  );
  return {
    coverage,
    diffFiles,
    thresholdMet: computeThresholdMet(coverage, opts.threshold),
  };
};

export const runMeasure = async (
  opts: MeasureOptions,
): Promise<MeasureOutcome> => {
  const diffFiles = await resolveMeasureDiffFiles(opts);
  return measureWithDiffFiles(opts, diffFiles);
};

export type MonorepoMeasureOutcome = {
  packages: Array<{
    cwd: string;
    outcome: MeasureOutcome;
    relCwd: string;
  }>;
};

export const measureMonorepo = async (
  opts: MeasureOptions,
  packageMap: Map<string, DiffFile[]>,
): Promise<MonorepoMeasureOutcome> => {
  const packages: MonorepoMeasureOutcome["packages"] = [];
  for (const [pkgCwd, pkgFiles] of packageMap) {
    const remapped = remapDiffFilePaths(pkgFiles, opts.cwd, pkgCwd);
    const outcome = await measureWithDiffFiles(
      { ...opts, cwd: pkgCwd },
      remapped,
    );
    packages.push({
      cwd: pkgCwd,
      outcome,
      relCwd: relative(opts.cwd, pkgCwd) || ".",
    });
  }
  return { packages };
};
