import { z } from "zod";
import { RunnerEnumSchema } from "../../shared/schema.js";

export const MeasureCLIOptsSchema = z.object({
  base: z.string().default("main"),
  cmd: z.string().optional(),
  cwd: z.string(),
  diffOnly: z.boolean().optional(),
  exclude: z.string().optional(),
  ext: z.string().default("ts,tsx,js,jsx"),
  json: z.boolean().optional(),
  runner: RunnerEnumSchema.default("auto"),
  threshold: z.number().optional(),
});
