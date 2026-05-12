import { z } from "zod";
import { OutputEnumSchema } from "../../applications/shared/output-enum.js";
import { RunnerEnumSchema } from "../../applications/shared/runner-enum.js";

export const MeasureCLIOptsSchema = z
  .object({
    base: z.string().optional(),
    cmd: z.string().optional(),
    cwd: z.string(),
    diffOnly: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    exclude: z.string().optional(),
    ext: z.string().default("ts,tsx,js,jsx"),
    include: z.string().optional(),
    json: z.boolean().optional(),
    output: OutputEnumSchema.default("stdout"),
    pr: z.number().int().positive().optional(),
    runner: RunnerEnumSchema.default("auto"),
    threshold: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.output === "stdout") {
      if (data.pr !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "--pr requires --output pr-review",
          path: ["pr"],
        });
      }
      if (data.dryRun) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "--dry-run requires --output pr-review",
          path: ["dryRun"],
        });
      }
    }
    if (data.output === "pr-review") {
      if (data.json) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "--json is not compatible with --output pr-review",
          path: ["json"],
        });
      }
      if (data.diffOnly) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "--diff-only is not compatible with --output pr-review",
          path: ["diffOnly"],
        });
      }
    }
  });

export type MeasureCliOptions = z.infer<typeof MeasureCLIOptsSchema>;
