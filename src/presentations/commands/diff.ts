import { resolve } from "node:path";
import type { Command } from "commander";
import type { z } from "zod";
import {
  formatDiffFiles,
  runDiffFiles,
} from "../../applications/diff/index.js";
import { parseCsv, parseCsvOption } from "../shared/csv.js";
import { DiffCLIOptsSchema } from "./diff-schema.js";

type DiffCliOptions = z.infer<typeof DiffCLIOptsSchema>;

const runDiffCommand = async (opts: DiffCliOptions): Promise<void> => {
  const { files } = await runDiffFiles({
    base: opts.base,
    cwd: resolve(opts.cwd),
    exclude: parseCsvOption(opts.exclude),
    extensions: parseCsv(opts.ext),
  });
  console.log(formatDiffFiles(files));
};

const diffAction = async (rawOpts: unknown): Promise<void> => {
  const parsed = DiffCLIOptsSchema.safeParse(rawOpts);
  if (!parsed.success) {
    console.error(parsed.error.message);
    process.exit(1);
  }
  await runDiffCommand(parsed.data);
};

export const registerDiffCommand = (program: Command): void => {
  program
    .command("diff")
    .description("List changed source files without running tests")
    .option(
      "-b, --base <branch>",
      "Base branch for diff (default: merge-base of HEAD and main)",
    )
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
    .action(diffAction);
};
