import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/config-file.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
}));
vi.mock("./runner-orchestrator.js", () => ({
  runCoverage: vi.fn(),
}));
vi.mock("../../repositories/git.js", () => ({
  getDiffFiles: vi.fn(),
}));
vi.mock("../shared/glob.js", () => ({
  globToRegex: vi.fn((g: string) => g),
}));

import { loadConfig } from "../../repositories/config-file.js";
import { type DiffFile, getDiffFiles } from "../../repositories/git.js";
import type { DiffCoverageResult } from "./coverage.js";
import {
  computeThresholdMet,
  type MeasureOutcome,
  measureWithDiffFiles,
  resolveMeasureDiffFiles,
  runMeasure,
} from "./index.js";
import { runCoverage } from "./runner-orchestrator.js";

const mockLoadConfig = vi.mocked(loadConfig);
const mockGetDiffFiles = vi.mocked(getDiffFiles);
const mockRunCoverage = vi.mocked(runCoverage);

const coverageResult = (
  overrides: Partial<DiffCoverageResult> = {},
): DiffCoverageResult => ({
  files: [],
  runner: "jest",
  summary: {
    branches: { covered: 0, pct: 0, total: 0 },
    coveredFiles: 0,
    functions: { covered: 0, pct: 0, total: 0 },
    lines: { covered: 80, pct: 80, total: 100 },
    statements: { covered: 80, pct: 80, total: 100 },
    totalFiles: 1,
  },
  timestamp: "2026-04-28T00:00:00.000Z",
  uncoveredFiles: [],
  ...overrides,
});

const diffFile = (overrides: Partial<DiffFile> = {}): DiffFile => ({
  addedLines: [],
  additions: 0,
  deletions: 0,
  path: "src/foo.ts",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockResolvedValue({});
});

describe("computeThresholdMet", () => {
  const result = coverageResult();

  it.each([
    {
      expected: null,
      name: "returns null when threshold is undefined",
      threshold: undefined,
    },
    {
      expected: true,
      name: "returns true when pct >= threshold",
      threshold: 80,
    },
    {
      expected: true,
      name: "returns true when pct equals threshold",
      threshold: 80,
    },
    {
      expected: false,
      name: "returns false when pct < threshold",
      threshold: 90,
    },
  ])("$name", ({ threshold, expected }) => {
    expect(computeThresholdMet(result, threshold)).toBe(expected);
  });
});

describe("resolveMeasureDiffFiles", () => {
  it("merges loadConfig.exclude with opts.exclude before calling getDiffFiles", async () => {
    mockLoadConfig.mockResolvedValueOnce({ exclude: ["a.ts"] });
    mockGetDiffFiles.mockResolvedValueOnce([]);

    await resolveMeasureDiffFiles({
      base: "main",
      cwd: "/repo",
      exclude: ["b.ts"],
      extensions: ["ts"],
    });

    expect(mockGetDiffFiles).toHaveBeenCalledWith(
      "/repo",
      "main",
      ["ts"],
      undefined,
      ["a.ts", "b.ts"],
    );
  });

  it("treats missing config.exclude and opts.exclude as empty arrays", async () => {
    mockLoadConfig.mockResolvedValueOnce({});
    mockGetDiffFiles.mockResolvedValueOnce([]);

    await resolveMeasureDiffFiles({ cwd: "/repo" });

    expect(mockGetDiffFiles).toHaveBeenCalledWith(
      "/repo",
      undefined,
      undefined,
      undefined,
      [],
    );
  });
});

describe("measureWithDiffFiles", () => {
  const baseOpts = { cwd: "/repo" };

  it("returns coverage, diffFiles, and thresholdMet computed from coverage summary", async () => {
    const files = [diffFile({ path: "src/a.ts" })];
    const coverage = coverageResult();
    mockRunCoverage.mockResolvedValueOnce(coverage);

    const outcome = await measureWithDiffFiles(
      { ...baseOpts, threshold: 90 },
      files,
    );

    expect(outcome).toEqual<MeasureOutcome>({
      coverage,
      diffFiles: files,
      thresholdMet: false,
    });
  });

  it("passes runner / testCommand / extensions through to runCoverage", async () => {
    mockRunCoverage.mockResolvedValueOnce(coverageResult());

    await measureWithDiffFiles(
      {
        base: "develop",
        cwd: "/repo",
        extensions: ["ts", "tsx"],
        runner: "vitest",
        testCommand: "pnpm vitest",
      },
      [],
    );

    expect(mockRunCoverage).toHaveBeenCalledWith(
      {
        base: "develop",
        cwd: "/repo",
        extensions: ["ts", "tsx"],
        runner: "vitest",
        testCommand: "pnpm vitest",
      },
      [],
    );
  });
});

describe("runMeasure", () => {
  it("composes diff resolution and coverage measurement", async () => {
    const files = [diffFile({ path: "src/a.ts" })];
    mockLoadConfig.mockResolvedValueOnce({ exclude: ["x"] });
    mockGetDiffFiles.mockResolvedValueOnce(files);
    mockRunCoverage.mockResolvedValueOnce(coverageResult());

    const outcome = await runMeasure({
      base: "main",
      cwd: "/repo",
      exclude: ["y"],
      extensions: ["ts"],
      threshold: 50,
    });

    expect(mockGetDiffFiles).toHaveBeenCalledWith(
      "/repo",
      "main",
      ["ts"],
      undefined,
      ["x", "y"],
    );
    expect(outcome.diffFiles).toBe(files);
    expect(outcome.thresholdMet).toBe(true);
  });

  it("still returns an outcome when no diff files are found", async () => {
    mockGetDiffFiles.mockResolvedValueOnce([]);
    mockRunCoverage.mockResolvedValueOnce(
      coverageResult({
        summary: {
          branches: { covered: 0, pct: 0, total: 0 },
          coveredFiles: 0,
          functions: { covered: 0, pct: 0, total: 0 },
          lines: { covered: 0, pct: 0, total: 0 },
          statements: { covered: 0, pct: 0, total: 0 },
          totalFiles: 0,
        },
      }),
    );

    const outcome = await runMeasure({ cwd: "/repo" });

    expect(outcome.diffFiles).toEqual([]);
    expect(outcome.thresholdMet).toBeNull();
  });
});
