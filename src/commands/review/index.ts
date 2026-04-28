import { resolve } from "node:path";
import type { Command } from "commander";
import type { z } from "zod";
import {
  GhNotAuthenticatedError,
  GhNotInstalledError,
} from "../../shared/github.js";
import { parseCsv, resolveExcludePatterns } from "../../shared/options.js";
import { formatReviewResult, NoPullRequestError, runReview } from "./review.js";
import { ReviewCLIOptsSchema } from "./schema.js";

type ReviewCliOptions = z.infer<typeof ReviewCLIOptsSchema>;

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

const reviewAction = async (rawOpts: unknown): Promise<void> => {
  const opts: ReviewCliOptions = ReviewCLIOptsSchema.parse(rawOpts);
  const cwd = resolve(opts.cwd);
  const extensions = parseCsv(opts.ext);
  const exclude = await resolveExcludePatterns(cwd, opts.exclude);

  try {
    console.error(`📝 Reviewing PR for current branch (base: ${opts.base})...`);
    const outcome = await runReview({
      base: opts.base,
      cwd,
      dryRun: opts.dryRun,
      exclude,
      extensions,
      pr: opts.pr,
      runner: opts.runner,
      threshold: opts.threshold,
    });
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
