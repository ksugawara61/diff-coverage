import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type StatementLocation = { start?: { line?: number } };
export type FileDetail = {
  b?: Record<string, number[]>;
  branchMap?: Record<string, { locations?: StatementLocation[] }>;
  f?: Record<string, number>;
  fnMap?: Record<string, { loc?: StatementLocation; name?: string }>;
  s?: Record<string, number>;
  statementMap?: Record<string, StatementLocation>;
};

type CoverageMetric = { covered: number; pct: number; total: number };
type CoverageSummaryEntry = {
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
  statements: CoverageMetric;
};
export type CoverageSummary = Record<string, CoverageSummaryEntry>;

export const readCoverageSummary = async (
  cwd: string,
): Promise<CoverageSummary> => {
  const summaryPath = resolve(cwd, "coverage/coverage-summary.json");
  const raw = await readFile(summaryPath, "utf-8");
  return JSON.parse(raw) as CoverageSummary;
};

export const readCoverageFinal = async (
  cwd: string,
): Promise<Record<string, FileDetail | undefined>> => {
  const detailPath = resolve(cwd, "coverage/coverage-final.json");
  const raw = await readFile(detailPath, "utf-8");
  return JSON.parse(raw) as Record<string, FileDetail | undefined>;
};
