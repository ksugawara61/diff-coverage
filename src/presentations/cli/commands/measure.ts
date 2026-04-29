import { resolve } from "node:path";
import type { Command } from "commander";
import type { z } from "zod";
import { resolveRunner } from "../../../applications/detect/index.js";
import { formatDiffFiles } from "../../../applications/diff/index.js";
import { formatResult } from "../../../applications/measure/format.js";
import {
  measureWithDiffFiles,
  resolveMeasureDiffFiles,
} from "../../../applications/measure/index.js";
import { parseCsv, parseCsvOption } from "../csv.js";
import { MeasureCLIOptsSchema } from "./measure-schema.js";

type MeasureCliOptions = z.infer<typeof MeasureCLIOptsSchema>;

const runMeasureCommand = async (opts: MeasureCliOptions): Promise<void> => {
  const cwd = resolve(opts.cwd);
  const extensions = parseCsv(opts.ext);
  const exclude = parseCsvOption(opts.exclude);
  const runner = await resolveRunner(cwd, opts.runner);

  console.error(
    `📊 Measuring diff coverage against ${opts.base} (runner: ${runner})...`,
  );

  try {
    const diffFiles = await resolveMeasureDiffFiles({
      base: opts.base,
      cwd,
      exclude,
      extensions,
    });

    if (diffFiles.length === 0) {
      console.log("No changed source files found.");
      process.exit(0);
    }

    console.error(
      `📁 Changed files: ${diffFiles.map((f) => f.path).join(", ")}`,
    );

    if (opts.diffOnly) {
      console.log(formatDiffFiles(diffFiles));
      process.exit(0);
    }

    const runnerLabel = runner === "vitest" ? "Vitest" : "Jest";
    console.error(`🧪 Running ${runnerLabel}...\n`);

    const outcome = await measureWithDiffFiles(
      {
        base: opts.base,
        cwd,
        exclude,
        extensions,
        runner,
        testCommand: opts.cmd,
        threshold: opts.threshold,
      },
      diffFiles,
    );

    if (opts.json) {
      console.log(JSON.stringify(outcome.coverage, null, 2));
    } else {
      console.log(formatResult(outcome.coverage, opts.threshold));
    }

    if (outcome.thresholdMet === false) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
};

const measureAction = async (rawOpts: unknown): Promise<void> => {
  const parsed = MeasureCLIOptsSchema.safeParse(rawOpts);
  if (!parsed.success) {
    console.error(parsed.error.message);
    process.exit(1);
  }
  await runMeasureCommand(parsed.data);
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
