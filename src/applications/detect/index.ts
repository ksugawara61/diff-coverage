import {
  detectRunner,
  type RunnerType,
} from "../../repositories/runners/detect.js";

export const resolveRunner = async (
  cwd: string,
  runner: RunnerType | "auto",
): Promise<RunnerType> =>
  runner === "auto" ? await detectRunner(cwd) : runner;

export { detectRunner };
