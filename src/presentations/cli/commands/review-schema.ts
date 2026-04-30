import { z } from "zod";
import { RunnerEnumSchema } from "../../../applications/shared/runner-enum.js";

export const ReviewCLIOptsSchema = z.object({
  base: z.string().optional(),
  cmd: z.string().optional(),
  cwd: z.string(),
  dryRun: z.boolean().optional(),
  exclude: z.string().optional(),
  ext: z.string().default("ts,tsx,js,jsx"),
  pr: z.number().int().positive().optional(),
  runner: RunnerEnumSchema.default("auto"),
  threshold: z.number().optional(),
});
