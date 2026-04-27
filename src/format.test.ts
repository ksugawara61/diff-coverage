import { describe, expect, it } from "vitest";
import type {
  DiffCoverageResult,
  FileCoverage,
  TypecheckResult,
} from "./core.js";
import { formatResult, formatTypecheckResult } from "./core.js";

function makeFileCoverage(
  path: string,
  pct: number,
  uncoveredLines: number[] = [],
): FileCoverage {
  const n = 10;
  const covered = Math.round((pct / 100) * n);
  return {
    branches: { covered, pct, total: n },
    functions: { covered, pct, total: n },
    lines: { covered, pct, total: n },
    path,
    statements: { covered, pct, total: n },
    uncoveredLines,
  };
}

function makeResult(
  overrides?: Partial<DiffCoverageResult>,
): DiffCoverageResult {
  return {
    files: [],
    runner: "jest",
    summary: {
      branches: { covered: 0, pct: 0, total: 0 },
      coveredFiles: 0,
      functions: { covered: 0, pct: 0, total: 0 },
      lines: { covered: 0, pct: 0, total: 0 },
      statements: { covered: 0, pct: 0, total: 0 },
      totalFiles: 0,
    },
    timestamp: "2024-01-01T00:00:00.000Z",
    uncoveredFiles: [],
    ...overrides,
  };
}

function resultWithFile(
  path: string,
  pct: number,
  uncoveredLines: number[] = [],
) {
  const file = makeFileCoverage(path, pct, uncoveredLines);
  return makeResult({
    files: [file],
    summary: {
      branches: file.branches,
      coveredFiles: pct > 0 ? 1 : 0,
      functions: file.functions,
      lines: file.lines,
      statements: file.statements,
      totalFiles: 1,
    },
  });
}

describe("formatResult", () => {
  it("shows no-data message when files is empty", () => {
    const out = formatResult(makeResult());
    expect(out).toContain("No diff files found");
  });

  it("includes runner name in header", () => {
    expect(formatResult(makeResult({ runner: "vitest" }))).toContain("vitest");
    expect(formatResult(makeResult({ runner: "jest" }))).toContain("jest");
  });

  it("shows file count and per-file path", () => {
    const out = formatResult(resultWithFile("src/foo.ts", 100));
    expect(out).toContain("Files changed: 1");
    expect(out).toContain("src/foo.ts");
  });

  it.each([
    [100, "✅"],
    [80, "✅"],
    [79, "⚠️"],
    [50, "⚠️"],
    [49, "❌"],
    [0, "❌"],
  ])("renders %d%% coverage with %s icon", (pct, icon) => {
    expect(formatResult(resultWithFile("src/a.ts", pct))).toContain(icon);
  });

  it.each([
    { expected: "✅ PASS", pct: 80, threshold: 80 },
    { expected: "❌ FAIL", pct: 60, threshold: 80 },
  ])("shows $expected when coverage is $pct% against threshold $threshold%", ({
    pct,
    threshold,
    expected,
  }) => {
    const out = formatResult(resultWithFile("src/a.ts", pct), threshold);
    expect(out).toContain(expected);
  });

  it("does not show threshold line when threshold is not provided", () => {
    const out = formatResult(resultWithFile("src/a.ts", 80));
    expect(out).not.toContain("Threshold");
  });

  it("shows uncovered lines", () => {
    const out = formatResult(resultWithFile("src/a.ts", 60, [5, 8, 9]));
    expect(out).toContain("Uncovered lines: 5, 8, 9");
  });

  it("truncates uncovered lines preview to 10 and shows overflow count", () => {
    const lines = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const out = formatResult(resultWithFile("src/a.ts", 0, lines));
    expect(out).toContain("(+2)");
    expect(out).not.toContain("11, 12");
  });

  it("shows coverage metrics in summary", () => {
    const out = formatResult(resultWithFile("src/a.ts", 80));
    expect(out).toContain("Lines:");
    expect(out).toContain("Statements:");
    expect(out).toContain("Functions:");
    expect(out).toContain("Branches:");
  });
});

describe("formatTypecheckResult", () => {
  function makeTypecheckResult(
    overrides?: Partial<TypecheckResult>,
  ): TypecheckResult {
    return {
      diffFiles: [],
      files: [],
      passed: true,
      timestamp: "2024-01-01T00:00:00.000Z",
      totalErrors: 0,
      ...overrides,
    };
  }

  function passingTypecheckResult(): TypecheckResult {
    return makeTypecheckResult({
      diffFiles: ["src/foo.ts"],
      files: [{ errors: [], path: "src/foo.ts" }],
      passed: true,
      totalErrors: 0,
    });
  }

  function failingTypecheckResult(): TypecheckResult {
    return makeTypecheckResult({
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
  }

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
