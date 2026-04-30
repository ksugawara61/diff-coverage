import { z } from "zod";
import { RunnerEnumSchema } from "../../applications/shared/runner-enum.js";

export const MeasureCLIOptsSchema = z.object({
  base: z.string().optional(),
  cmd: z.string().optional(),
  cwd: z.string(),
  diffOnly: z.boolean().optional(),
  exclude: z.string().optional(),
  ext: z.string().default("ts,tsx,js,jsx"),
  json: z.boolean().optional(),
  runner: RunnerEnumSchema.default("auto"),
  threshold: z.number().optional(),
});
