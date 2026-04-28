#!/usr/bin/env node
import { resolve } from "node:path";
import { Command } from "commander";
import {
  formatResult,
  formatTypecheckResult,
  getDiffFiles,
  loadConfig,
  runCoverage,
  runTypecheck,
} from "./core.js";
import { GhNotAuthenticatedError, GhNotInstalledError } from "./github.js";
import {
  formatReviewResult,
  NoPullRequestError,
  type ReviewOptions,
  runReview,
} from "./review.js";
import { detectRunner, type RunnerType } from "./runner/detect.js";

type MeasureOpts = {
  base: string;
  cmd?: string;
  diffOnly: boolean;
  exclude: string[];
  json: boolean;
  threshold?: number;
};

async function measureFiles(
  opts: MeasureOpts,
  cwd: string,
  extensions: string[],
  runner: RunnerType,
): Promise<void> {
  const diffFiles = await getDiffFiles(
    cwd,
    opts.base,
    extensions,
    undefined,
    opts.exclude,
  );

  if (diffFiles.length === 0) {
    console.log("No changed source files found.");
    process.exit(0);
  }

  console.error(`📁 Changed files: ${diffFiles.map((f) => f.path).join(", ")}`);

  if (opts.diffOnly) {
    console.log(diffFiles.map((f) => f.path).join("\n"));
    process.exit(0);
  }

  const runnerLabel = runner === "vitest" ? "Vitest" : "Jest";
  console.error(`🧪 Running ${runnerLabel}...\n`);

  const result = await runCoverage(
    {
      base: opts.base,
      cwd,
      extensions,
      runner,
      testCommand: opts.cmd,
    },
    diffFiles,
  );

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatResult(result, opts.threshold));
  }

  if (
    opts.threshold !== undefined &&
    result.summary.lines.pct < opts.threshold
  ) {
    process.exit(1);
  }
}

const program = new Command();

program
  .name("diff-coverage")
  .description("Measure test coverage for git diff files (Jest or Vitest)")
  .version("0.1.0");

program
  .command("measure", { isDefault: true })
  .description("Measure coverage for changed files")
  .option("-b, --base <branch>", "Base branch to diff against", "main")
  .option("-c, --cwd <path>", "Project root directory", process.cwd())
  .option(
    "-r, --runner <runner>",
    "Test runner: jest | vitest | auto (default: auto)",
    "auto",
  )
  .option("--cmd <command>", "Override test command (e.g. 'pnpm vitest')")
  .option(
    "--ext <extensions>",
    "Comma-separated file extensions",
    "ts,tsx,js,jsx",
  )
  .option(
    "--threshold <number>",
    "Fail if line coverage is below this %",
    Number.parseFloat,
  )
  .option("--json", "Output raw JSON")
  .option("--diff-only", "Only show diff files, don't run tests")
  .option(
    "--exclude <patterns>",
    "Comma-separated glob patterns to exclude files (e.g. '*.mocks.ts,src/fixtures/**')",
  )
  .action(async (opts) => {
    const cwd = resolve(opts.cwd);
    const extensions = opts.ext.split(",").map((e: string) => e.trim());
    const runner =
      opts.runner === "auto" ? await detectRunner(cwd) : opts.runner;

    console.error(
      `📊 Measuring diff coverage against ${opts.base} (runner: ${runner})...`,
    );

    try {
      const config = await loadConfig(cwd);
      const exclude = [
        ...(config.exclude ?? []),
        ...(opts.exclude
          ? opts.exclude.split(",").map((e: string) => e.trim())
          : []),
      ];
      await measureFiles(
        {
          base: opts.base,
          cmd: opts.cmd,
          diffOnly: opts.diffOnly,
          exclude,
          json: opts.json,
          threshold: opts.threshold,
        },
        cwd,
        extensions,
        runner,
      );
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command("diff")
  .description("List changed source files without running tests")
  .option("-b, --base <branch>", "Base branch to diff against", "main")
  .option("-c, --cwd <path>", "Project root directory", process.cwd())
  .option(
    "--ext <extensions>",
    "Comma-separated file extensions",
    "ts,tsx,js,jsx",
  )
  .option(
    "--exclude <patterns>",
    "Comma-separated glob patterns to exclude files (e.g. '*.mocks.ts,src/fixtures/**')",
  )
  .action(async (opts) => {
    const cwd = resolve(opts.cwd);
    const extensions = opts.ext.split(",").map((e: string) => e.trim());

    const config = await loadConfig(cwd);
    const exclude = [
      ...(config.exclude ?? []),
      ...(opts.exclude
        ? opts.exclude.split(",").map((e: string) => e.trim())
        : []),
    ];

    const files = await getDiffFiles(
      cwd,
      opts.base,
      extensions,
      undefined,
      exclude,
    );
    if (files.length === 0) {
      console.log("No changed source files.");
      return;
    }

    for (const f of files) {
      console.log(`${f.path}  (+${f.additions}/-${f.deletions})`);
    }
  });

program
  .command("detect")
  .description("Detect which test runner is configured in the project")
  .option("-c, --cwd <path>", "Project root directory", process.cwd())
  .action(async (opts) => {
    const cwd = resolve(opts.cwd);
    const runner = await detectRunner(cwd);
    console.log(`Detected runner: ${runner}`);
  });

program
  .command("typecheck")
  .description("Run TypeScript type-check on changed files")
  .option("-b, --base <branch>", "Base branch to diff against", "main")
  .option("-c, --cwd <path>", "Project root directory", process.cwd())
  .option(
    "--cmd <command>",
    "Override typecheck command (e.g. 'pnpm tsc --noEmit')",
  )
  .option(
    "--ext <extensions>",
    "Comma-separated file extensions",
    "ts,tsx,mts,cts",
  )
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const cwd = resolve(opts.cwd);
    const extensions = opts.ext.split(",").map((e: string) => e.trim());

    console.error(`🔍 Type-checking diff against ${opts.base}...`);

    try {
      const diffFiles = await getDiffFiles(cwd, opts.base, extensions);

      if (diffFiles.length === 0) {
        console.log("No changed TypeScript files found.");
        process.exit(0);
      }

      console.error(
        `📁 Changed files: ${diffFiles.map((f) => f.path).join(", ")}`,
      );
      console.error("⚙️  Running tsc...\n");

      const result = await runTypecheck(cwd, diffFiles, opts.cmd);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatTypecheckResult(result));
      }

      if (!result.passed) {
        process.exit(1);
      }
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

type ReviewCliOpts = {
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
  opts: ReviewCliOpts,
): Promise<ReviewOptions> => {
  const cwd = resolve(opts.cwd);
  const extensions = opts.ext.split(",").map((e) => e.trim());
  const config = await loadConfig(cwd);
  const exclude = [
    ...(config.exclude ?? []),
    ...(opts.exclude ? opts.exclude.split(",").map((e) => e.trim()) : []),
  ];
  return {
    base: opts.base,
    cwd,
    dryRun: opts.dryRun,
    exclude,
    extensions,
    pr: opts.pr,
    runner: opts.runner,
    threshold: opts.threshold,
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
  .option("--pr <number>", "PR number override", (v) => Number.parseInt(v, 10))
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
  .action(async (rawOpts) => {
    try {
      const options = await parseReviewCliOptions(rawOpts as ReviewCliOpts);
      console.error(
        `📝 Reviewing PR for current branch (base: ${options.base})...`,
      );
      const outcome = await runReview(options);
      console.log(formatReviewResult(outcome));
      if (outcome.thresholdMet === false) process.exit(1);
    } catch (err) {
      handleReviewError(err);
    }
  });

program.parse();
