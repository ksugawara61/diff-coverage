import { describe, expect, it } from "vitest";
import { globToRegex } from "./glob.js";

describe("globToRegex", () => {
  it.each([
    {
      expected: true,
      input: "src/foo.mocks.ts",
      name: "matches filename with * anywhere in path",
      pattern: "*.mocks.ts",
    },
    {
      expected: true,
      input: "foo.mocks.ts",
      name: "matches root-level filename with *",
      pattern: "*.mocks.ts",
    },
    {
      expected: true,
      input: "src/deep/foo.mocks.ts",
      name: "matches deeply nested filename with *",
      pattern: "*.mocks.ts",
    },
    {
      expected: false,
      input: "src/foo.test.ts",
      name: "does not match different file suffix",
      pattern: "*.mocks.ts",
    },
    {
      expected: false,
      input: "src/foo.mocks.js",
      name: "does not match different extension",
      pattern: "*.mocks.ts",
    },
    {
      expected: true,
      input: "src/foo.ts",
      name: "matches at root with *",
      pattern: "*.ts",
    },
    {
      expected: true,
      input: "src/sub/bar.ts",
      name: "matches nested file with *",
      pattern: "*.ts",
    },
    {
      expected: true,
      input: "foo.mocks.ts",
      name: "matches root-level filename with **/ prefix",
      pattern: "**/*.mocks.ts",
    },
    {
      expected: true,
      input: "src/foo.mocks.ts",
      name: "matches one-segment-deep filename with **/ prefix",
      pattern: "**/*.mocks.ts",
    },
    {
      expected: true,
      input: "src/utils/foo.mocks.ts",
      name: "matches multi-segment-deep filename with **/ prefix",
      pattern: "**/*.mocks.ts",
    },
    {
      expected: true,
      input: "src/foo.mocks.ts",
      name: "matches when slash-anchored pattern starts at root",
      pattern: "src/*.mocks.ts",
    },
    {
      expected: false,
      input: "other/foo.mocks.ts",
      name: "rejects when slash-anchored pattern misses root prefix",
      pattern: "src/*.mocks.ts",
    },
    {
      expected: false,
      input: "other/src/foo.mocks.ts",
      name: "rejects when slash-anchored pattern is shifted into a subdir",
      pattern: "src/*.mocks.ts",
    },
    {
      expected: true,
      input: "src/foo.ts",
      name: "matches direct child with dir/**",
      pattern: "src/**",
    },
    {
      expected: true,
      input: "src/utils/bar.ts",
      name: "matches deep descendant with dir/**",
      pattern: "src/**",
    },
    {
      expected: false,
      input: "other/foo.ts",
      name: "rejects sibling directory with dir/**",
      pattern: "src/**",
    },
    {
      expected: true,
      input: "src/foo.mocks.ts",
      name: "matches direct child with dir/**/file",
      pattern: "src/**/*.mocks.ts",
    },
    {
      expected: true,
      input: "src/utils/foo.mocks.ts",
      name: "matches one-deep child with dir/**/file",
      pattern: "src/**/*.mocks.ts",
    },
    {
      expected: true,
      input: "src/a/b/foo.mocks.ts",
      name: "matches two-deep child with dir/**/file",
      pattern: "src/**/*.mocks.ts",
    },
    {
      expected: false,
      input: "other/foo.mocks.ts",
      name: "rejects sibling directory with dir/**/file",
      pattern: "src/**/*.mocks.ts",
    },
    {
      expected: true,
      input: "src/fooa.ts",
      name: "matches single character with ?",
      pattern: "foo?.ts",
    },
    {
      expected: false,
      input: "src/foo.ts",
      name: "rejects when ? has no character to match",
      pattern: "foo?.ts",
    },
  ])("$name", ({ pattern, input, expected }) => {
    expect(new RegExp(globToRegex(pattern)).test(input)).toBe(expected);
  });
});
