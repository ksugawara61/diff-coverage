import { z } from "zod";

export const OutputEnumSchema = z.enum(["stdout", "pr-review"]);
