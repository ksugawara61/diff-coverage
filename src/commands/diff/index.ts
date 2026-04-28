import { resolve } from "node:path";
import type { Command } from "commander";
import type { z } from "zod";
import { getDiffFiles } from "../../shared/diff.js";
import { parseCsv, resolveExcludePatterns } from "../../shared/options.js";
import { DiffCLIOptsSchema } from "./schema.js";

type DiffCliOptions = z.infer<typeof DiffCLIOptsSchema>;

const runDiff = async (opts: DiffCliOptions): Promise<void> => {
  const cwd = resolve(opts.cwd);
  const extensions = parseCsv(opts.ext);
  const exclude = await resolveExcludePatterns(cwd, opts.exclude);

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

  for (const file of files) {
    console.log(`${file.path}  (+${file.additions}/-${file.deletions})`);
  }
};

const diffAction = async (rawOpts: unknown): Promise<void> => {
  const parsed = DiffCLIOptsSchema.safeParse(rawOpts);
  if (!parsed.success) {
    console.error(parsed.error.message);
    process.exit(1);
  }
  await runDiff(parsed.data);
};

export const registerDiffCommand = (program: Command): void => {
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
    .action(diffAction);
};
