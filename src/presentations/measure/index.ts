import { relative, resolve } from "node:path";
import type { Command } from "commander";
import { resolveRunner } from "../../applications/detect/index.js";
import { formatDiffFiles } from "../../applications/diff/index.js";
import {
  formatMonorepoResult,
  formatResult,
} from "../../applications/measure/format.js";
import {
  type MeasureOptions,
  type MeasureOutcome,
  type MonorepoMeasureOutcome,
  measureMonorepo,
  measureWithDiffFiles,
  resolveMeasureDiffFiles,
} from "../../applications/measure/index.js";
import type { DiffFile } from "../../repositories/git.js";
import {
  groupDiffFilesByPackage,
  remapDiffFilePaths,
} from "../../repositories/monorepo.js";
import { parseCsv, parseCsvOption } from "../shared/csv.js";
import { MeasureCLIOptsSchema, type MeasureCliOptions } from "./schema.js";

const printMonorepoResult = (
  outcome: MonorepoMeasureOutcome,
  threshold: number | undefined,
  json: boolean | undefined,
): void => {
  if (json) {
    console.log(
      JSON.stringify(
        outcome.packages.map((p) => ({
          coverage: p.outcome.coverage,
          cwd: p.relCwd,
        })),
        null,
        2,
      ),
    );
  } else {
    console.log(formatMonorepoResult(outcome.packages, threshold));
  }
  if (outcome.packages.some((p) => p.outcome.thresholdMet === false)) {
    process.exit(1);
  }
};

const printSingleResult = (
  outcome: MeasureOutcome,
  threshold: number | undefined,
  json: boolean | undefined,
): void => {
  if (json) {
    console.log(JSON.stringify(outcome.coverage, null, 2));
  } else {
    console.log(formatResult(outcome.coverage, threshold));
  }
  if (outcome.thresholdMet === false) {
    process.exit(1);
  }
};

const runMonorepoMode = async (
  opts: MeasureCliOptions,
  baseOpts: MeasureOptions,
  packageMap: Map<string, DiffFile[]>,
): Promise<void> => {
  console.error(
    `📊 Measuring diff coverage against ${opts.base ?? "merge-base of HEAD and main"} (monorepo: ${packageMap.size} packages)...`,
  );
  console.error(
    [...packageMap.entries()]
      .map(
        ([pkgCwd, pkgFiles]) =>
          `📁 ${relative(baseOpts.cwd, pkgCwd) || "."}: ${pkgFiles.map((f) => f.path).join(", ")}`,
      )
      .join("\n"),
  );
  const outcome = await measureMonorepo(baseOpts, packageMap);
  printMonorepoResult(outcome, opts.threshold, opts.json);
};

const runSinglePackageMode = async (
  opts: MeasureCliOptions,
  baseOpts: MeasureOptions,
  diffFiles: DiffFile[],
): Promise<void> => {
  const runner = await resolveRunner(
    baseOpts.cwd,
    opts.runner,
    baseOpts.testCommand,
  );
  console.error(
    `📊 Measuring diff coverage against ${opts.base ?? "merge-base of HEAD and main"} (runner: ${runner})...`,
  );
  console.error(`📁 Changed files: ${diffFiles.map((f) => f.path).join(", ")}`);
  console.error(`🧪 Running ${runner === "vitest" ? "Vitest" : "Jest"}...\n`);
  const outcome = await measureWithDiffFiles(
    { ...baseOpts, runner },
    diffFiles,
  );
  printSingleResult(outcome, opts.threshold, opts.json);
};

const resolveSinglePackageArgs = (
  cwd: string,
  baseOpts: MeasureOptions,
  diffFiles: DiffFile[],
  packageMap: Map<string, DiffFile[]>,
): { pkgOpts: MeasureOptions; pkgFiles: DiffFile[] } => {
  const entry = [...packageMap.entries()][0];
  if (entry && entry[0] !== cwd) {
    const [pkgCwd, pkgFiles] = entry;
    return {
      pkgFiles: remapDiffFilePaths(pkgFiles, cwd, pkgCwd),
      pkgOpts: { ...baseOpts, cwd: pkgCwd },
    };
  }
  return { pkgFiles: diffFiles, pkgOpts: baseOpts };
};

const runMeasureCommand = async (opts: MeasureCliOptions): Promise<void> => {
  const cwd = resolve(opts.cwd);
  const extensions = parseCsv(opts.ext);
  const exclude = parseCsvOption(opts.exclude);
  const baseOpts: MeasureOptions = {
    base: opts.base,
    cwd,
    exclude,
    extensions,
    runner: opts.runner,
    testCommand: opts.cmd,
    threshold: opts.threshold,
  };

  try {
    const diffFiles = await resolveMeasureDiffFiles(baseOpts);

    if (diffFiles.length === 0) {
      console.log("No changed source files found.");
      process.exit(0);
    }

    if (opts.diffOnly) {
      console.log(formatDiffFiles(diffFiles));
      process.exit(0);
    }

    const packageMap = await groupDiffFilesByPackage(cwd, diffFiles);

    if (packageMap.size > 1) {
      await runMonorepoMode(opts, baseOpts, packageMap);
    } else {
      const { pkgOpts, pkgFiles } = resolveSinglePackageArgs(
        cwd,
        baseOpts,
        diffFiles,
        packageMap,
      );
      await runSinglePackageMode(opts, pkgOpts, pkgFiles);
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
    .action(async (rawOpts) => {
      const parsed = MeasureCLIOptsSchema.safeParse(rawOpts);
      if (!parsed.success) {
        console.error(parsed.error.message);
        process.exit(1);
      }
      await runMeasureCommand(parsed.data);
    });
};
