import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/coverage-files.js", () => ({
  readCoverageFinal: vi.fn(),
  readCoverageSummary: vi.fn(),
}));
vi.mock("../../repositories/runners/detect.js", () => ({
  detectRunner: vi.fn(),
}));
vi.mock("../../repositories/runners/jest.js", () => ({ runJest: vi.fn() }));
vi.mock("../../repositories/runners/vitest.js", () => ({
  runVitest: vi.fn(),
}));

import {
  readCoverageFinal,
  readCoverageSummary,
} from "../../repositories/coverage-files.js";
import type { DiffFile } from "../../repositories/git.js";
import { detectRunner } from "../../repositories/runners/detect.js";
import { runJest } from "../../repositories/runners/jest.js";
import { runVitest } from "../../repositories/runners/vitest.js";
import { runCoverage } from "./runner-orchestrator.js";

const mockReadCoverageSummary = vi.mocked(readCoverageSummary);
const mockReadCoverageFinal = vi.mocked(readCoverageFinal);
const mockDetectRunner = vi.mocked(detectRunner);
const mockRunJest = vi.mocked(runJest);
const mockRunVitest = vi.mocked(runVitest);

const CWD = "/project";

const makeDiffFile = (
  path: string,
  overrides?: Partial<DiffFile>,
): DiffFile => ({
  addedLines: [],
  additions: 0,
  deletions: 0,
  path,
  repoPath: path,
  ...overrides,
});

const makeSummaryEntry = (pct: number) => {
  const covered = Math.round((pct / 100) * 10);
  return {
    branches: { covered: Math.round((pct / 100) * 4), pct, total: 4 },
    functions: { covered: Math.round((pct / 100) * 5), pct, total: 5 },
    lines: { covered, pct, total: 10 },
    statements: { covered, pct, total: 10 },
  };
};

describe("runCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectRunner.mockResolvedValue("jest");
    mockRunJest.mockResolvedValue(undefined as never);
    mockRunVitest.mockResolvedValue(undefined as never);
  });

  it("returns empty result without running tests when diffFiles is empty", async () => {
    const result = await runCoverage({ cwd: CWD }, []);
    expect(result.files).toEqual([]);
    expect(result.summary.totalFiles).toBe(0);
    expect(mockRunJest).not.toHaveBeenCalled();
    expect(mockRunVitest).not.toHaveBeenCalled();
  });

  it("reflects auto-detected runner in result when diffFiles is empty", async () => {
    mockDetectRunner.mockResolvedValue("vitest");
    const result = await runCoverage({ cwd: CWD }, []);
    expect(result.runner).toBe("vitest");
  });

  it("calls detectRunner with cwd when runner option is auto", async () => {
    mockReadCoverageSummary.mockRejectedValueOnce(new Error("ENOENT"));
    await runCoverage({ cwd: CWD, runner: "auto" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(mockDetectRunner).toHaveBeenCalledWith(CWD);
  });

  it("infers vitest from testCommand without calling detectRunner", async () => {
    mockReadCoverageSummary.mockRejectedValueOnce(new Error("ENOENT"));
    await runCoverage(
      {
        cwd: CWD,
        testCommand: "pnpm exec vitest related --config .vitest/config.ts",
      },
      [makeDiffFile("src/foo.ts")],
    );
    expect(mockDetectRunner).not.toHaveBeenCalled();
    expect(mockRunVitest).toHaveBeenCalled();
    expect(mockRunJest).not.toHaveBeenCalled();
  });

  it("infers jest from testCommand without calling detectRunner", async () => {
    mockReadCoverageSummary.mockRejectedValueOnce(new Error("ENOENT"));
    await runCoverage(
      { cwd: CWD, testCommand: "pnpm exec jest --config jest.config.ts" },
      [makeDiffFile("src/foo.ts")],
    );
    expect(mockDetectRunner).not.toHaveBeenCalled();
    expect(mockRunJest).toHaveBeenCalled();
    expect(mockRunVitest).not.toHaveBeenCalled();
  });

  it("falls back to detectRunner when testCommand has no known runner keyword", async () => {
    mockReadCoverageSummary.mockRejectedValueOnce(new Error("ENOENT"));
    await runCoverage({ cwd: CWD, testCommand: "pnpm test" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(mockDetectRunner).toHaveBeenCalledWith(CWD);
  });

  it("invokes jest runner when runner is jest", async () => {
    mockReadCoverageSummary.mockRejectedValueOnce(new Error("ENOENT"));
    await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(mockRunJest).toHaveBeenCalled();
    expect(mockRunVitest).not.toHaveBeenCalled();
  });

  it("invokes vitest runner when runner is vitest", async () => {
    mockReadCoverageSummary.mockRejectedValueOnce(new Error("ENOENT"));
    await runCoverage({ cwd: CWD, runner: "vitest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(mockRunVitest).toHaveBeenCalled();
    expect(mockRunJest).not.toHaveBeenCalled();
  });

  it("returns empty result when coverage-summary.json is missing", async () => {
    mockReadCoverageSummary.mockRejectedValueOnce(new Error("ENOENT"));
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(result.files).toEqual([]);
  });

  it("still returns coverage data when coverage-final.json is missing", async () => {
    const summaryData = { [`${CWD}/src/foo.ts`]: makeSummaryEntry(100) };
    mockReadCoverageSummary.mockResolvedValueOnce(summaryData);
    mockReadCoverageFinal.mockRejectedValueOnce(new Error("ENOENT"));
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].uncoveredLines).toEqual([]);
  });

  it("parses coverage summary and returns per-file metrics", async () => {
    const summaryData = {
      total: makeSummaryEntry(90),
      [`${CWD}/src/foo.ts`]: makeSummaryEntry(80),
    };
    mockReadCoverageSummary.mockResolvedValueOnce(summaryData);
    mockReadCoverageFinal.mockResolvedValueOnce({});
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/foo.ts");
    expect(result.files[0].lines.pct).toBe(80);
    expect(result.runner).toBe("jest");
  });

  it("accumulates totals across all diff files", async () => {
    const summaryData = {
      [`${CWD}/src/a.ts`]: {
        branches: { covered: 4, pct: 100, total: 4 },
        functions: { covered: 5, pct: 100, total: 5 },
        lines: { covered: 10, pct: 100, total: 10 },
        statements: { covered: 10, pct: 100, total: 10 },
      },
      [`${CWD}/src/b.ts`]: {
        branches: { covered: 2, pct: 50, total: 4 },
        functions: { covered: 2, pct: 40, total: 5 },
        lines: { covered: 6, pct: 60, total: 10 },
        statements: { covered: 6, pct: 60, total: 10 },
      },
    };
    mockReadCoverageSummary.mockResolvedValueOnce(summaryData);
    mockReadCoverageFinal.mockResolvedValueOnce({});
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/a.ts"),
      makeDiffFile("src/b.ts"),
    ]);
    expect(result.summary.lines.covered).toBe(16);
    expect(result.summary.lines.total).toBe(20);
    expect(result.summary.totalFiles).toBe(2);
  });

  it("populates uncoveredLines from statement map in coverage-final.json", async () => {
    const summaryData = { [`${CWD}/src/foo.ts`]: makeSummaryEntry(80) };
    const detailData = {
      [`${CWD}/src/foo.ts`]: {
        s: { "0": 1, "1": 0, "2": 0, "3": 0 },
        statementMap: {
          "0": { start: { line: 1 } },
          "1": { start: { line: 5 } },
          "2": { start: { line: 10 } },
          "3": {},
        },
      },
    };
    mockReadCoverageSummary.mockResolvedValueOnce(summaryData);
    mockReadCoverageFinal.mockResolvedValueOnce(detailData);
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(result.files[0].uncoveredLines).toEqual([5, 10]);
  });

  it("adds diff files absent from coverage report with zero metrics", async () => {
    mockReadCoverageSummary.mockResolvedValueOnce({});
    mockReadCoverageFinal.mockResolvedValueOnce({});
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/foo.ts");
    expect(result.files[0].lines.pct).toBe(0);
    expect(result.uncoveredFiles).toContain("src/foo.ts");
  });

  it("marks files with line coverage below 50% as uncovered", async () => {
    const summaryData = { [`${CWD}/src/foo.ts`]: makeSummaryEntry(40) };
    mockReadCoverageSummary.mockResolvedValueOnce(summaryData);
    mockReadCoverageFinal.mockResolvedValueOnce({});
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(result.uncoveredFiles).toContain("src/foo.ts");
  });

  it("excludes files not in the diff from results", async () => {
    const summaryData = {
      [`${CWD}/src/foo.ts`]: makeSummaryEntry(80),
      [`${CWD}/src/other.ts`]: makeSummaryEntry(100),
    };
    mockReadCoverageSummary.mockResolvedValueOnce(summaryData);
    mockReadCoverageFinal.mockResolvedValueOnce({});
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/foo.ts");
  });
});
