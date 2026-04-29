import { z } from "zod";

export const RunnerEnumSchema = z.enum(["jest", "vitest", "auto"]);
