import { z } from "zod";

export const DetectCLIOptsSchema = z.object({
  cwd: z.string(),
});
