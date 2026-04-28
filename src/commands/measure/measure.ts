import {
  type DiffCoverageResult,
  type RunOptions,
  runCoverage,
} from "../../shared/coverage.js";
import { type DiffFile, getDiffFiles } from "../../shared/diff.js";
import { mergeExcludePatterns } from "../../shared/options.js";

type MeasureOptions = {
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
  const exclude = await mergeExcludePatterns(opts.cwd, opts.exclude);
  return getDiffFiles(opts.cwd, opts.base, opts.extensions, undefined, exclude);
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
