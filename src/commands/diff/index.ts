import { resolve } from "node:path";
import type { Command } from "commander";
import { getDiffFiles } from "../../shared/diff.js";
import { parseCsv, resolveExcludePatterns } from "../../shared/options.js";

type DiffCliOptions = {
  base: string;
  cwd: string;
  exclude?: string;
  ext: string;
};

const diffAction = async (rawOpts: DiffCliOptions): Promise<void> => {
  const cwd = resolve(rawOpts.cwd);
  const extensions = parseCsv(rawOpts.ext);
  const exclude = await resolveExcludePatterns(cwd, rawOpts.exclude);

  const files = await getDiffFiles(
    cwd,
    rawOpts.base,
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
