import { resolve } from "node:path";
import type { Command } from "commander";
import type { z } from "zod";
import { formatTypecheckResult } from "../../../applications/typecheck/format.js";
import { runTypecheck } from "../../../applications/typecheck/index.js";
import { getDiffFiles } from "../../../repositories/git.js";
import { parseCsv } from "../csv.js";
import { TypecheckCLIOptsSchema } from "./typecheck-schema.js";

type TypecheckCliOptions = z.infer<typeof TypecheckCLIOptsSchema>;

const runTypecheckCommand = async (
  opts: TypecheckCliOptions,
): Promise<void> => {
  const cwd = resolve(opts.cwd);
  const extensions = parseCsv(opts.ext);

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
};

const typecheckAction = async (rawOpts: unknown): Promise<void> => {
  const parsed = TypecheckCLIOptsSchema.safeParse(rawOpts);
  if (!parsed.success) {
    console.error(parsed.error.message);
    process.exit(1);
  }
  await runTypecheckCommand(parsed.data);
};

export const registerTypecheckCommand = (program: Command): void => {
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
    .action(typecheckAction);
};
