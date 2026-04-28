import { describe, expect, it } from "vitest";
import { formatTypecheckResult } from "./format.js";
import type { TypecheckResult } from "./typecheck.js";

const makeTypecheckResult = (
  overrides?: Partial<TypecheckResult>,
): TypecheckResult => ({
  diffFiles: [],
  files: [],
  passed: true,
  timestamp: "2024-01-01T00:00:00.000Z",
  totalErrors: 0,
  ...overrides,
});

const passingTypecheckResult = (): TypecheckResult =>
  makeTypecheckResult({
    diffFiles: ["src/foo.ts"],
    files: [{ errors: [], path: "src/foo.ts" }],
    passed: true,
    totalErrors: 0,
  });

const failingTypecheckResult = (): TypecheckResult =>
  makeTypecheckResult({
    diffFiles: ["src/foo.ts"],
    files: [
      {
        errors: [
          {
            code: "TS2322",
            column: 5,
            file: "src/foo.ts",
            line: 10,
            message: "Type 'string' is not assignable to type 'number'.",
          },
        ],
        path: "src/foo.ts",
      },
    ],
    passed: false,
    totalErrors: 1,
  });

describe("formatTypecheckResult", () => {
  it("shows no-files message when files list is empty", () => {
    const out = formatTypecheckResult(makeTypecheckResult());
    expect(out).toContain("No changed TypeScript files found");
  });

  describe("with a passing result", () => {
    it("shows file count and error count", () => {
      const out = formatTypecheckResult(passingTypecheckResult());
      expect(out).toContain("Files checked: 1");
      expect(out).toContain("Total errors: 0");
    });

    it("shows PASS status", () => {
      expect(formatTypecheckResult(passingTypecheckResult())).toContain(
        "✅ PASS",
      );
    });

    it("does not show error section", () => {
      expect(formatTypecheckResult(passingTypecheckResult())).not.toContain(
        "Errors by File",
      );
    });
  });

  describe("with a failing result", () => {
    it("shows FAIL status", () => {
      expect(formatTypecheckResult(failingTypecheckResult())).toContain(
        "❌ FAIL",
      );
    });

    it.each([
      ["TS2322"],
      ["10:5"],
      ["src/foo.ts"],
    ])("shows error detail %s", (fragment) => {
      expect(formatTypecheckResult(failingTypecheckResult())).toContain(
        fragment,
      );
    });
  });
});
