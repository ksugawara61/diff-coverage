import { resolve } from "node:path";
import type { Command } from "commander";
import type { z } from "zod";
import { runCoverage } from "../../shared/coverage.js";
import { getDiffFiles } from "../../shared/diff.js";
import { formatResult } from "../../shared/format.js";
import { parseCsv, resolveExcludePatterns } from "../../shared/options.js";
import { resolveRunner } from "../../shared/runner.js";
import { MeasureCLIOptsSchema } from "./schema.js";

type MeasureCliOptions = z.infer<typeof MeasureCLIOptsSchema>;

const measureAction = async (rawOpts: unknown): Promise<void> => {
  const opts: MeasureCliOptions = MeasureCLIOptsSchema.parse(rawOpts);
  const cwd = resolve(opts.cwd);
  const extensions = parseCsv(opts.ext);
  const runner = await resolveRunner(cwd, opts.runner);

  console.error(
    `📊 Measuring diff coverage against ${opts.base} (runner: ${runner})...`,
  );

  try {
    const exclude = await resolveExcludePatterns(cwd, opts.exclude);
    const diffFiles = await getDiffFiles(
      cwd,
      opts.base,
      extensions,
      undefined,
      exclude,
    );

    if (diffFiles.length === 0) {
      console.log("No changed source files found.");
      process.exit(0);
    }

    console.error(
      `📁 Changed files: ${diffFiles.map((f) => f.path).join(", ")}`,
    );

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
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
};

export const registerMeasureCommand = (program: Command): void => {
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
    .action(measureAction);
};
