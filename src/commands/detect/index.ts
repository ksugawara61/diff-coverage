import { resolve } from "node:path";
import type { Command } from "commander";
import type { z } from "zod";
import { detectRunner } from "../../runner/detect.js";
import { DetectCLIOptsSchema } from "./schema.js";

type DetectCliOptions = z.infer<typeof DetectCLIOptsSchema>;

const runDetect = async (opts: DetectCliOptions): Promise<void> => {
  const cwd = resolve(opts.cwd);
  const runner = await detectRunner(cwd);
  console.log(`Detected runner: ${runner}`);
};

const detectAction = async (rawOpts: unknown): Promise<void> => {
  const parsed = DetectCLIOptsSchema.safeParse(rawOpts);
  if (!parsed.success) {
    console.error(parsed.error.message);
    process.exit(1);
  }
  await runDetect(parsed.data);
};

export const registerDetectCommand = (program: Command): void => {
  program
    .command("detect")
    .description("Detect which test runner is configured in the project")
    .option("-c, --cwd <path>", "Project root directory", process.cwd())
    .action(detectAction);
};
