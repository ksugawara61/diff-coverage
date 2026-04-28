import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
vi.mock("./runner/detect.js", () => ({ detectRunner: vi.fn() }));
vi.mock("./runner/jest.js", () => ({ runJest: vi.fn() }));
vi.mock("./runner/vitest.js", () => ({ runVitest: vi.fn() }));

import { readFile } from "node:fs/promises";
import { execa } from "execa";
import { type DiffFile, runCoverage, runTypecheck } from "./core.js";
import { detectRunner } from "./runner/detect.js";
import { runJest } from "./runner/jest.js";
import { runVitest } from "./runner/vitest.js";

const mockExeca = vi.mocked(execa);
const mockReadFile = vi.mocked(readFile);
const mockDetectRunner = vi.mocked(detectRunner);
const mockRunJest = vi.mocked(runJest);
const mockRunVitest = vi.mocked(runVitest);

const CWD = "/project";

function makeDiffFile(path: string, overrides?: Partial<DiffFile>): DiffFile {
  return { addedLines: [], additions: 0, deletions: 0, path, ...overrides };
}

function makeSummaryEntry(pct: number) {
  const covered = Math.round((pct / 100) * 10);
  return {
    branches: { covered: Math.round((pct / 100) * 4), pct, total: 4 },
    functions: { covered: Math.round((pct / 100) * 5), pct, total: 5 },
    lines: { covered, pct, total: 10 },
    statements: { covered, pct, total: 10 },
  };
}

function mockCoverageFiles(summaryJson: string, detailJson = "{}") {
  mockReadFile.mockResolvedValueOnce(summaryJson as never);
  mockReadFile.mockResolvedValueOnce(detailJson as never);
}

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
    mockCoverageFiles("{}");
    await runCoverage({ cwd: CWD, runner: "auto" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(mockDetectRunner).toHaveBeenCalledWith(CWD);
  });

  it("invokes jest runner when runner is jest", async () => {
    mockCoverageFiles("{}");
    await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(mockRunJest).toHaveBeenCalled();
    expect(mockRunVitest).not.toHaveBeenCalled();
  });

  it("invokes vitest runner when runner is vitest", async () => {
    mockCoverageFiles("{}");
    await runCoverage({ cwd: CWD, runner: "vitest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(mockRunVitest).toHaveBeenCalled();
    expect(mockRunJest).not.toHaveBeenCalled();
  });

  it("returns empty result when coverage-summary.json is missing", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(result.files).toEqual([]);
  });

  it("still returns coverage data when coverage-final.json is missing", async () => {
    const summaryData = { [`${CWD}/src/foo.ts`]: makeSummaryEntry(100) };
    mockReadFile.mockResolvedValueOnce(JSON.stringify(summaryData) as never);
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
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
    mockCoverageFiles(JSON.stringify(summaryData));
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
    mockCoverageFiles(JSON.stringify(summaryData));
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
    mockCoverageFiles(JSON.stringify(summaryData), JSON.stringify(detailData));
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(result.files[0].uncoveredLines).toEqual([5, 10]);
  });

  it("adds diff files absent from coverage report with zero metrics", async () => {
    mockCoverageFiles("{}");
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
    mockCoverageFiles(JSON.stringify(summaryData));
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
    mockCoverageFiles(JSON.stringify(summaryData));
    const result = await runCoverage({ cwd: CWD, runner: "jest" }, [
      makeDiffFile("src/foo.ts"),
    ]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/foo.ts");
  });
});

describe("runTypecheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns passing result when tsc has no errors", async () => {
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout: "" } as never);
    const result = await runTypecheck(CWD, [makeDiffFile("src/foo.ts")]);
    expect(result.passed).toBe(true);
    expect(result.totalErrors).toBe(0);
    expect(result.files[0].errors).toEqual([]);
  });

  it("parses TypeScript errors from tsc stdout", async () => {
    const stdout =
      "src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout } as never);
    const result = await runTypecheck(CWD, [makeDiffFile("src/foo.ts")]);
    expect(result.passed).toBe(false);
    expect(result.totalErrors).toBe(1);
    expect(result.files[0].errors[0]).toMatchObject({
      code: "TS2322",
      column: 5,
      file: "src/foo.ts",
      line: 10,
      message: "Type 'string' is not assignable to type 'number'.",
    });
  });

  it("parses TypeScript errors from tsc stderr", async () => {
    const stderr = "src/foo.ts(3,1): error TS2304: Cannot find name 'x'.";
    mockExeca.mockResolvedValueOnce({ stderr, stdout: "" } as never);
    const result = await runTypecheck(CWD, [makeDiffFile("src/foo.ts")]);
    expect(result.totalErrors).toBe(1);
  });

  it("filters errors to only files present in the diff", async () => {
    const stdout = [
      "src/foo.ts(10,5): error TS2322: Error in foo.",
      "src/other.ts(5,3): error TS2304: Error in other.",
    ].join("\n");
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout } as never);
    const result = await runTypecheck(CWD, [makeDiffFile("src/foo.ts")]);
    expect(result.totalErrors).toBe(1);
    expect(result.diffFiles).toEqual(["src/foo.ts"]);
  });

  it("uses custom command when cmd is provided", async () => {
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout: "" } as never);
    await runTypecheck(CWD, [], "pnpm tsc --noEmit");
    expect(mockExeca).toHaveBeenCalledWith(
      "pnpm",
      ["tsc", "--noEmit"],
      expect.objectContaining({ cwd: CWD }),
    );
  });

  it("distributes errors to their respective file entries", async () => {
    const stdout = [
      "src/a.ts(1,1): error TS2322: Error in a.",
      "src/b.ts(2,2): error TS2304: Error in b.",
    ].join("\n");
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout } as never);
    const result = await runTypecheck(CWD, [
      makeDiffFile("src/a.ts"),
      makeDiffFile("src/b.ts"),
    ]);
    expect(result.totalErrors).toBe(2);
    expect(result.passed).toBe(false);
    expect(result.files[0].errors).toHaveLength(1);
    expect(result.files[1].errors).toHaveLength(1);
  });

  it("includes all diff file paths in result even when no errors", async () => {
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout: "" } as never);
    const result = await runTypecheck(CWD, [
      makeDiffFile("src/a.ts"),
      makeDiffFile("src/b.ts"),
    ]);
    expect(result.diffFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.files).toHaveLength(2);
  });
});
