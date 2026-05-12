import { resolve } from "node:path";
import type { Command } from "commander";
import {
  formatReviewResult,
  runReview,
} from "../../applications/review/index.js";
import { parseCsv, parseCsvOption } from "../shared/csv.js";
import { handleReviewError } from "../shared/handle-review-error.js";
import { ReviewCLIOptsSchema, type ReviewCliOptions } from "./schema.js";

const runReviewCommand = async (opts: ReviewCliOptions): Promise<void> => {
  console.error(
    "⚠️  `review` is deprecated and will be removed in a future release. Use `measure --output pr-review` instead.",
  );
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

export const registerReviewCommand = (program: Command): void => {
  program
    .command("review")
    .description(
      "Post inline review comments on the GitHub PR for the current branch (uses `gh` CLI for auth)",
    )
    .option(
      "-b, --base <branch>",
      "Base branch for diff (default: merge-base of HEAD and main)",
    )
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
    .option("--cmd <command>", "Override test command (e.g. 'pnpm vitest')")
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
    .option(
      "--include <patterns>",
      "Comma-separated glob patterns to include files",
    )
    .action(async (rawOpts) => {
      const parsed = ReviewCLIOptsSchema.safeParse(rawOpts);
      if (!parsed.success) {
        console.error(parsed.error.message);
        process.exit(1);
      }
      await runReviewCommand(parsed.data);
    });
};
