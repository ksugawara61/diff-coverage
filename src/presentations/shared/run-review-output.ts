import { resolve } from "node:path";
import type { RunOptions } from "../../applications/measure/coverage.js";
import {
  formatReviewResult,
  runReview,
} from "../../applications/review/index.js";
import { parseCsv, parseCsvOption } from "./csv.js";
import { handleReviewError } from "./handle-review-error.js";

export type ReviewOutputArgs = {
  base?: string;
  cmd?: string;
  cwd: string;
  dryRun?: boolean;
  exclude?: string;
  ext: string;
  include?: string;
  pr?: number;
  runner: RunOptions["runner"];
  threshold?: number;
};

export const runReviewOutput = async (
  opts: ReviewOutputArgs,
): Promise<void> => {
  try {
    console.error(
      `📝 Reviewing PR for current branch (base: ${opts.base ?? "merge-base of HEAD and main"})...`,
    );
    const outcome = await runReview({
      base: opts.base,
      cwd: resolve(opts.cwd),
      dryRun: opts.dryRun,
      exclude: parseCsvOption(opts.exclude),
      extensions: parseCsv(opts.ext),
      include: parseCsvOption(opts.include),
      pr: opts.pr,
      runner: opts.runner,
      testCommand: opts.cmd,
      threshold: opts.threshold,
    });
    console.log(formatReviewResult(outcome));
    if (outcome.thresholdMet === false) process.exit(1);
  } catch (err) {
    handleReviewError(err);
  }
};
