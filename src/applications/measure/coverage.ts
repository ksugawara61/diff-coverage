import { relative, resolve } from "node:path";
import type {
  CoverageSummary,
  FileDetail,
} from "../../repositories/coverage-files.js";
import type { DiffFile } from "../../repositories/git.js";
import type { RunnerType } from "../../repositories/runners/detect.js";

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

const getUncoveredLines = (fileDetail: FileDetail | undefined): number[] => {
  if (!fileDetail?.s) return [];
  const lines = Object.entries(fileDetail.s)
    .filter(([, count]) => count === 0)
    .map(([id]) => fileDetail.statementMap?.[id]?.start?.line)
    .filter((line): line is number => typeof line === "number");
  return [...new Set(lines)].sort((a, b) => a - b);
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

export const computeFileCoverages = (
  summaryData: CoverageSummary,
  detailData: Record<string, FileDetail | undefined>,
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

const pct = (covered: number, total: number) =>
  total === 0 ? 0 : Math.round((covered / total) * 10000) / 100;

export const buildCoverageResult = (
  files: FileCoverage[],
  uncoveredFiles: string[],
  totals: Totals,
  runner: RunnerType,
): DiffCoverageResult => ({
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
});

export const emptyResult = (runner: RunnerType): DiffCoverageResult => ({
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
