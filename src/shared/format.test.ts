import { describe, expect, it } from "vitest";
import type { DiffCoverageResult, FileCoverage } from "./coverage.js";
import { formatResult } from "./format.js";

const makeFileCoverage = (
  path: string,
  pct: number,
  uncoveredLines: number[] = [],
): FileCoverage => {
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
};

const makeResult = (
  overrides?: Partial<DiffCoverageResult>,
): DiffCoverageResult => ({
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
});

const resultWithFile = (
  path: string,
  pct: number,
  uncoveredLines: number[] = [],
) => {
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
};

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
