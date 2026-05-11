import { describe, expect, it } from "vitest";
import { MeasureCLIOptsSchema } from "./schema.js";

describe("MeasureCLIOptsSchema", () => {
  it("accepts include patterns", () => {
    const parsed = MeasureCLIOptsSchema.parse({
      cwd: "/repo",
      include: "src/**,packages/api/**",
    });

    expect(parsed.include).toBe("src/**,packages/api/**");
  });
});
