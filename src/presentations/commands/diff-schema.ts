import { z } from "zod";

export const DiffCLIOptsSchema = z.object({
  base: z.string().optional(),
  cwd: z.string(),
  exclude: z.string().optional(),
  ext: z.string().default("ts,tsx,js,jsx"),
});
