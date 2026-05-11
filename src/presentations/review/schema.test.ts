import { describe, expect, it } from "vitest";
import { ReviewCLIOptsSchema } from "./schema.js";

describe("ReviewCLIOptsSchema", () => {
  it("accepts include patterns", () => {
    const parsed = ReviewCLIOptsSchema.parse({
      cwd: "/repo",
      include: "src/**,packages/api/**",
    });

    expect(parsed.include).toBe("src/**,packages/api/**");
  });
});
