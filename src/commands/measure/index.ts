import { resolve } from "node:path";
import type { Command } from "commander";
import { formatResult, getDiffFiles, runCoverage } from "../../core.js";
import type { RunnerType } from "../../runner/detect.js";
import { parseCsv, resolveExcludePatterns } from "../../shared/options.js";
import { resolveRunner } from "../../shared/runner.js";

type MeasureCliOptions = {
  base: string;
  cmd?: string;
  cwd: string;
  diffOnly?: boolean;
  exclude?: string;
  ext: string;
  json?: boolean;
  runner: RunnerType | "auto";
  threshold?: number;
};

const measureAction = async (rawOpts: MeasureCliOptions): Promise<void> => {
  const cwd = resolve(rawOpts.cwd);
  const extensions = parseCsv(rawOpts.ext);
  const runner = await resolveRunner(cwd, rawOpts.runner);

  console.error(
    `📊 Measuring diff coverage against ${rawOpts.base} (runner: ${runner})...`,
  );

  try {
    const exclude = await resolveExcludePatterns(cwd, rawOpts.exclude);
    const diffFiles = await getDiffFiles(
      cwd,
      rawOpts.base,
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

    if (rawOpts.diffOnly) {
      console.log(diffFiles.map((f) => f.path).join("\n"));
      process.exit(0);
    }

    const runnerLabel = runner === "vitest" ? "Vitest" : "Jest";
    console.error(`🧪 Running ${runnerLabel}...\n`);

    const result = await runCoverage(
      {
        base: rawOpts.base,
        cwd,
        extensions,
        runner,
        testCommand: rawOpts.cmd,
      },
      diffFiles,
    );

    if (rawOpts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatResult(result, rawOpts.threshold));
    }

    if (
      rawOpts.threshold !== undefined &&
      result.summary.lines.pct < rawOpts.threshold
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
