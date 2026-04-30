import {
  detectRunner,
  type RunnerType,
} from "../../repositories/runners/detect.js";

export const resolveRunner = async (
  cwd: string,
  runner: RunnerType | "auto",
  testCommand?: string,
): Promise<RunnerType> => {
  if (runner !== "auto") return runner;
  if (testCommand?.includes("vitest")) return "vitest";
  if (testCommand?.includes("jest")) return "jest";
  return detectRunner(cwd);
};
