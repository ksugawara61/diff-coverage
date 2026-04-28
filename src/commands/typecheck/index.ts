import { resolve } from "node:path";
import type { Command } from "commander";
import { getDiffFiles } from "../../shared/diff.js";
import { parseCsv } from "../../shared/options.js";
import { formatTypecheckResult } from "./format.js";
import { runTypecheck } from "./typecheck.js";

type TypecheckCliOptions = {
  base: string;
  cmd?: string;
  cwd: string;
  ext: string;
  json?: boolean;
};

const typecheckAction = async (rawOpts: TypecheckCliOptions): Promise<void> => {
  const cwd = resolve(rawOpts.cwd);
  const extensions = parseCsv(rawOpts.ext);

  console.error(`🔍 Type-checking diff against ${rawOpts.base}...`);

  try {
    const diffFiles = await getDiffFiles(cwd, rawOpts.base, extensions);

    if (diffFiles.length === 0) {
      console.log("No changed TypeScript files found.");
      process.exit(0);
    }

    console.error(
      `📁 Changed files: ${diffFiles.map((f) => f.path).join(", ")}`,
    );
    console.error("⚙️  Running tsc...\n");

    const result = await runTypecheck(cwd, diffFiles, rawOpts.cmd);

    if (rawOpts.json) {
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
