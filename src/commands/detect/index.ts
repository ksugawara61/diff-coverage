import { resolve } from "node:path";
import type { Command } from "commander";
import { detectRunner } from "../../runner/detect.js";

type DetectCliOptions = {
  cwd: string;
};

const detectAction = async (rawOpts: DetectCliOptions): Promise<void> => {
  const cwd = resolve(rawOpts.cwd);
  const runner = await detectRunner(cwd);
  console.log(`Detected runner: ${runner}`);
};

export const registerDetectCommand = (program: Command): void => {
  program
    .command("detect")
    .description("Detect which test runner is configured in the project")
    .option("-c, --cwd <path>", "Project root directory", process.cwd())
    .action(detectAction);
};
