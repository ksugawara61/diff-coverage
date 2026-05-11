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

  it("defaults output to stdout", () => {
    const parsed = MeasureCLIOptsSchema.parse({ cwd: "/repo" });
    expect(parsed.output).toBe("stdout");
  });

  it.each([
    {
      input: { cwd: "/repo", json: true, output: "pr-review" },
      name: "--json with --output pr-review",
      path: "json",
    },
    {
      input: { cwd: "/repo", diffOnly: true, output: "pr-review" },
      name: "--diff-only with --output pr-review",
      path: "diffOnly",
    },
    {
      input: { cwd: "/repo", output: "stdout", pr: 42 },
      name: "--pr with --output stdout",
      path: "pr",
    },
    {
      input: { cwd: "/repo", dryRun: true, output: "stdout" },
      name: "--dry-run with --output stdout",
      path: "dryRun",
    },
  ])("rejects $name", ({ input, path }) => {
    const result = MeasureCLIOptsSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes(path))).toBe(true);
    }
  });

  it("accepts --pr and --dry-run with --output pr-review", () => {
    const parsed = MeasureCLIOptsSchema.parse({
      cwd: "/repo",
      dryRun: true,
      output: "pr-review",
      pr: 42,
    });
    expect(parsed.output).toBe("pr-review");
    expect(parsed.pr).toBe(42);
    expect(parsed.dryRun).toBe(true);
  });
});
