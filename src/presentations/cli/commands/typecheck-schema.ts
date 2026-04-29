import { z } from "zod";

export const TypecheckCLIOptsSchema = z.object({
  base: z.string().default("main"),
  cmd: z.string().optional(),
  cwd: z.string(),
  ext: z.string().default("ts,tsx,mts,cts"),
  json: z.boolean().optional(),
});
