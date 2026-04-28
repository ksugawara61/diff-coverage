import { resolve } from "node:path";
import type { Command } from "commander";
import { GhNotAuthenticatedError, GhNotInstalledError } from "../../github.js";
import {
  formatReviewResult,
  NoPullRequestError,
  type ReviewOptions,
  runReview,
} from "../../review.js";
import type { RunnerType } from "../../runner/detect.js";
import { parseCsv, resolveExcludePatterns } from "../../shared/options.js";

type ReviewCliOptions = {
  base: string;
  cwd: string;
  dryRun?: boolean;
  exclude?: string;
  ext: string;
  pr?: number;
  runner: RunnerType | "auto";
  threshold?: number;
};

const parseReviewCliOptions = async (
  rawOpts: ReviewCliOptions,
): Promise<ReviewOptions> => {
  const cwd = resolve(rawOpts.cwd);
  const extensions = parseCsv(rawOpts.ext);
  const exclude = await resolveExcludePatterns(cwd, rawOpts.exclude);
  return {
    base: rawOpts.base,
    cwd,
    dryRun: rawOpts.dryRun,
    exclude,
    extensions,
    pr: rawOpts.pr,
    runner: rawOpts.runner,
    threshold: rawOpts.threshold,
  };
};

const handleReviewError = (err: unknown): never => {
  if (err instanceof GhNotInstalledError) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  if (err instanceof GhNotAuthenticatedError) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  if (err instanceof NoPullRequestError) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
};

const reviewAction = async (rawOpts: ReviewCliOptions): Promise<void> => {
  try {
    const options = await parseReviewCliOptions(rawOpts);
    console.error(
      `📝 Reviewing PR for current branch (base: ${options.base})...`,
    );
    const outcome = await runReview(options);
    console.log(formatReviewResult(outcome));
    if (outcome.thresholdMet === false) process.exit(1);
  } catch (err) {
    handleReviewError(err);
  }
};

export const registerReviewCommand = (program: Command): void => {
  program
    .command("review")
    .description(
      "Post inline review comments on the GitHub PR for the current branch (uses `gh` CLI for auth)",
    )
    .option("-b, --base <branch>", "Base branch to diff against", "main")
    .option("-c, --cwd <path>", "Project root directory", process.cwd())
    .option(
      "-r, --runner <runner>",
      "Test runner: jest | vitest | auto (default: auto)",
      "auto",
    )
    .option("--pr <number>", "PR number override", (v) =>
      Number.parseInt(v, 10),
    )
    .option(
      "--threshold <number>",
      "Minimum line coverage % (CLI exits 1 if below; review event is still COMMENT)",
      Number.parseFloat,
    )
    .option("--dry-run", "Print planned comments without posting")
    .option(
      "--ext <extensions>",
      "Comma-separated file extensions",
      "ts,tsx,js,jsx",
    )
    .option(
      "--exclude <patterns>",
      "Comma-separated glob patterns to exclude files",
    )
    .action(reviewAction);
};
