import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { detectRunner, type RunnerType } from "../runner/detect.js";
import { runJest } from "../runner/jest.js";
import { runVitest } from "../runner/vitest.js";
import type { DiffFile } from "./diff.js";

export type FileCoverage = {
  branches: { covered: number; pct: number; total: number };
  functions: { covered: number; pct: number; total: number };
  lines: { covered: number; pct: number; total: number };
  path: string;
  statements: { covered: number; pct: number; total: number };
  uncoveredLines: number[];
};

export type DiffCoverageResult = {
  files: FileCoverage[];
  runner: RunnerType;
  summary: {
    branches: { covered: number; pct: number; total: number };
    coveredFiles: number;
    functions: { covered: number; pct: number; total: number };
    lines: { covered: number; pct: number; total: number };
    statements: { covered: number; pct: number; total: number };
    totalFiles: number;
  };
  timestamp: string;
  uncoveredFiles: string[];
};

export type RunOptions = {
  base?: string;
  cwd: string;
  exclude?: string[];
  excludePatterns?: string[];
  extensions?: string[];
  runner?: RunnerType | "auto";
  testCommand?: string;
  threshold?: number;
};

// Istanbul/V8 coverage file format
type StatementLocation = { start?: { line?: number } };
export type FileDetail = {
  b?: Record<string, number[]>;
  branchMap?: Record<string, { locations?: StatementLocation[] }>;
  f?: Record<string, number>;
  fnMap?: Record<string, { loc?: StatementLocation; name?: string }>;
  s?: Record<string, number>;
  statementMap?: Record<string, StatementLocation>;
};
type CoverageDetail = Record<string, FileDetail | undefined>;

type CoverageMetric = { covered: number; pct: number; total: number };
type CoverageSummaryEntry = {
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
  statements: CoverageMetric;
};
type CoverageSummary = Record<string, CoverageSummaryEntry>;

type Totals = {
  branchCovered: number;
  branchTotal: number;
  fnCovered: number;
  fnTotal: number;
  lineCovered: number;
  lineTotal: number;
  stmtCovered: number;
  stmtTotal: number;
};

const resolveRunner = async (options: RunOptions): Promise<RunnerType> => {
  const { runner = "auto", cwd } = options;
  if (runner === "auto") return detectRunner(cwd);
  return runner;
};

export const runCoverage = async (
  options: RunOptions,
  diffFiles: DiffFile[],
): Promise<DiffCoverageResult> => {
  const { cwd } = options;

  if (diffFiles.length === 0) {
    const runner = await resolveRunner(options);
    return emptyResult(runner);
  }

  const runner = await resolveRunner(options);

  if (runner === "vitest") {
    await runVitest(options, diffFiles);
  } else {
    await runJest(options, diffFiles);
  }

  return parseCoverageReport(cwd, diffFiles, runner);
};

const addMissingDiffFiles = (
  files: FileCoverage[],
  uncoveredFiles: string[],
  diffFiles: DiffFile[],
  cwd: string,
): void => {
  for (const df of diffFiles) {
    const abs = resolve(cwd, df.path);
    const inCoverage = files.some((f) => resolve(cwd, f.path) === abs);
    if (!inCoverage) {
      uncoveredFiles.push(df.path);
      files.push({
        branches: { covered: 0, pct: 0, total: 0 },
        functions: { covered: 0, pct: 0, total: 0 },
        lines: { covered: 0, pct: 0, total: 0 },
        path: df.path,
        statements: { covered: 0, pct: 0, total: 0 },
        uncoveredLines: [],
      });
    }
  }
};

const computeFileCoverages = (
  summaryData: CoverageSummary,
  detailData: CoverageDetail,
  cwd: string,
  diffFiles: DiffFile[],
): { files: FileCoverage[]; totals: Totals; uncoveredFiles: string[] } => {
  const diffPaths = new Set(diffFiles.map((f) => resolve(cwd, f.path)));
  const files: FileCoverage[] = [];
  const uncoveredFiles: string[] = [];
  const totals: Totals = {
    branchCovered: 0,
    branchTotal: 0,
    fnCovered: 0,
    fnTotal: 0,
    lineCovered: 0,
    lineTotal: 0,
    stmtCovered: 0,
    stmtTotal: 0,
  };

  for (const [absPath, data] of Object.entries(summaryData)) {
    if (absPath === "total") continue;
    const relPath = relative(cwd, absPath);
    if (!diffPaths.has(absPath) && !diffPaths.has(resolve(cwd, relPath)))
      continue;

    const { branches: b, functions: f, lines: l, statements: s } = data;
    totals.stmtTotal += s.total;
    totals.stmtCovered += s.covered;
    totals.lineTotal += l.total;
    totals.lineCovered += l.covered;
    totals.fnTotal += f.total;
    totals.fnCovered += f.covered;
    totals.branchTotal += b.total;
    totals.branchCovered += b.covered;

    const uncoveredLines = getUncoveredLines(detailData[absPath]);
    files.push({
      branches: { covered: b.covered, pct: b.pct, total: b.total },
      functions: { covered: f.covered, pct: f.pct, total: f.total },
      lines: { covered: l.covered, pct: l.pct, total: l.total },
      path: relPath,
      statements: { covered: s.covered, pct: s.pct, total: s.total },
      uncoveredLines,
    });
    if (l.pct < 50) uncoveredFiles.push(relPath);
  }

  addMissingDiffFiles(files, uncoveredFiles, diffFiles, cwd);
  return { files, totals, uncoveredFiles };
};

const parseCoverageReport = async (
  cwd: string,
  diffFiles: DiffFile[],
  runner: RunnerType,
): Promise<DiffCoverageResult> => {
  const summaryPath = resolve(cwd, "coverage/coverage-summary.json");
  const detailPath = resolve(cwd, "coverage/coverage-final.json");

  let summaryData: CoverageSummary = {};
  let detailData: CoverageDetail = {};

  try {
    summaryData = JSON.parse(
      await readFile(summaryPath, "utf-8"),
    ) as CoverageSummary;
  } catch {
    return emptyResult(runner);
  }

  try {
    detailData = JSON.parse(
      await readFile(detailPath, "utf-8"),
    ) as CoverageDetail;
  } catch {
    // detail report is optional
  }

  const { files, uncoveredFiles, totals } = computeFileCoverages(
    summaryData,
    detailData,
    cwd,
    diffFiles,
  );

  const pct = (covered: number, total: number) =>
    total === 0 ? 0 : Math.round((covered / total) * 10000) / 100;

  return {
    files,
    runner,
    summary: {
      branches: {
        covered: totals.branchCovered,
        pct: pct(totals.branchCovered, totals.branchTotal),
        total: totals.branchTotal,
      },
      coveredFiles: files.filter((f) => f.lines.pct > 0).length,
      functions: {
        covered: totals.fnCovered,
        pct: pct(totals.fnCovered, totals.fnTotal),
        total: totals.fnTotal,
      },
      lines: {
        covered: totals.lineCovered,
        pct: pct(totals.lineCovered, totals.lineTotal),
        total: totals.lineTotal,
      },
      statements: {
        covered: totals.stmtCovered,
        pct: pct(totals.stmtCovered, totals.stmtTotal),
        total: totals.stmtTotal,
      },
      totalFiles: files.length,
    },
    timestamp: new Date().toISOString(),
    uncoveredFiles,
  };
};

const getUncoveredLines = (fileDetail: FileDetail | undefined): number[] => {
  if (!fileDetail?.s) return [];
  const lines = Object.entries(fileDetail.s)
    .filter(([, count]) => count === 0)
    .map(([id]) => fileDetail.statementMap?.[id]?.start?.line)
    .filter((line): line is number => typeof line === "number");
  return [...new Set(lines)].sort((a, b) => a - b);
};

const emptyResult = (runner: RunnerType): DiffCoverageResult => ({
  files: [],
  runner,
  summary: {
    branches: { covered: 0, pct: 0, total: 0 },
    coveredFiles: 0,
    functions: { covered: 0, pct: 0, total: 0 },
    lines: { covered: 0, pct: 0, total: 0 },
    statements: { covered: 0, pct: 0, total: 0 },
    totalFiles: 0,
  },
  timestamp: new Date().toISOString(),
  uncoveredFiles: [],
});
