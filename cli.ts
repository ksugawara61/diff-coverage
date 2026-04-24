#!/usr/bin/env node
import { resolve } from "node:path";
import { Command } from "commander";
import { formatResult, getDiffFiles, runCoverage } from "./core.js";
import { detectRunner, type RunnerType } from "./runner/detect.js";

type MeasureOpts = {
  base: string;
  cmd?: string;
  diffOnly: boolean;
  json: boolean;
  threshold?: number;
};

async function measureFiles(
  opts: MeasureOpts,
  cwd: string,
  extensions: string[],
  runner: RunnerType,
): Promise<void> {
  const diffFiles = await getDiffFiles(cwd, opts.base, extensions);

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
  .action(async (opts) => {
    const cwd = resolve(opts.cwd);
    const extensions = opts.ext.split(",").map((e: string) => e.trim());
    const runner =
      opts.runner === "auto" ? await detectRunner(cwd) : opts.runner;

    console.error(
      `📊 Measuring diff coverage against ${opts.base} (runner: ${runner})...`,
    );

    try {
      await measureFiles(
        {
          base: opts.base,
          cmd: opts.cmd,
          diffOnly: opts.diffOnly,
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
  .action(async (opts) => {
    const cwd = resolve(opts.cwd);
    const extensions = opts.ext.split(",").map((e: string) => e.trim());

    const files = await getDiffFiles(cwd, opts.base, extensions);
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

program.parse();
