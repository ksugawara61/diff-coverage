import { execa } from "execa";
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { detectRunner, type RunnerType } from "./runner/detect.js";
import { runJest } from "./runner/jest.js";
import { runVitest } from "./runner/vitest.js";

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  addedLines: number[];
}

export interface FileCoverage {
  path: string;
  statements: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  lines: { total: number; covered: number; pct: number };
  uncoveredLines: number[];
}

export interface DiffCoverageResult {
  runner: RunnerType;
  summary: {
    totalFiles: number;
    coveredFiles: number;
    statements: { total: number; covered: number; pct: number };
    lines: { total: number; covered: number; pct: number };
    functions: { total: number; covered: number; pct: number };
    branches: { total: number; covered: number; pct: number };
  };
  files: FileCoverage[];
  uncoveredFiles: string[];
  timestamp: string;
}

export interface RunOptions {
  cwd: string;
  base?: string;
  runner?: RunnerType | "auto";
  testCommand?: string;
  extensions?: string[];
  excludePatterns?: string[];
  threshold?: number;
}

const DEFAULT_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mts", "cts"];
const DEFAULT_EXCLUDE = [
  "\\.test\\.",
  "\\.spec\\.",
  "__tests__",
  "\\.d\\.ts$",
  "/node_modules/",
  "/dist/",
  "/coverage/",
];

// ─── Git diff helpers ────────────────────────────────────────────────────────

export async function getDiffFiles(
  cwd: string,
  base = "main",
  extensions = DEFAULT_EXTENSIONS,
  excludePatterns = DEFAULT_EXCLUDE
): Promise<DiffFile[]> {
  const extPattern = extensions.join("|");

  let baseRef = base;
  try {
    await execa("git", ["rev-parse", "--verify", `origin/${base}`], { cwd });
    baseRef = `origin/${base}`;
  } catch {
    // use base as-is (works for commit SHAs, tags, etc.)
  }

  const { stdout: nameOnly } = await execa(
    "git",
    ["diff", baseRef, "--name-only", "--diff-filter=ACM"],
    { cwd }
  );

  const allFiles = nameOnly
    .split("\n")
    .filter(Boolean)
    .filter((f) => new RegExp(`\\.(${extPattern})$`).test(f))
    .filter((f) => !excludePatterns.some((p) => new RegExp(p).test(f)));

  if (allFiles.length === 0) return [];

  const { stdout: diffStat } = await execa(
    "git",
    ["diff", baseRef, "--numstat", "--diff-filter=ACM"],
    { cwd }
  );

  const statMap = new Map<string, { additions: number; deletions: number }>();
  for (const line of diffStat.split("\n").filter(Boolean)) {
    const [add, del, file] = line.split("\t");
    statMap.set(file, {
      additions: parseInt(add) || 0,
      deletions: parseInt(del) || 0,
    });
  }

  const files: DiffFile[] = [];
  for (const filePath of allFiles) {
    const stat = statMap.get(filePath) ?? { additions: 0, deletions: 0 };
    const addedLines = await getAddedLines(cwd, baseRef, filePath);
    files.push({ path: filePath, ...stat, addedLines });
  }

  return files;
}

async function getAddedLines(
  cwd: string,
  base: string,
  filePath: string
): Promise<number[]> {
  try {
    const { stdout } = await execa(
      "git",
      ["diff", base, "--unified=0", "--", filePath],
      { cwd }
    );

    const lines: number[] = [];
    let currentLine = 0;

    for (const line of stdout.split("\n")) {
      const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (hunkHeader) {
        currentLine = parseInt(hunkHeader[1]);
        continue;
      }
      if (line.startsWith("+") && !line.startsWith("+++")) {
        lines.push(currentLine++);
      } else if (!line.startsWith("-")) {
        currentLine++;
      }
    }

    return lines;
  } catch {
    return [];
  }
}

// ─── Coverage runner ─────────────────────────────────────────────────────────

export async function runCoverage(
  options: RunOptions,
  diffFiles: DiffFile[]
): Promise<DiffCoverageResult> {
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
}

async function resolveRunner(options: RunOptions): Promise<RunnerType> {
  const { runner = "auto", cwd } = options;
  if (runner === "auto") return detectRunner(cwd);
  return runner;
}

// Keep old export name for backward compatibility
export const runJestCoverage = runCoverage;

// ─── Report parsing ───────────────────────────────────────────────────────────

async function parseCoverageReport(
  cwd: string,
  diffFiles: DiffFile[],
  runner: RunnerType
): Promise<DiffCoverageResult> {
  const summaryPath = resolve(cwd, "coverage/coverage-summary.json");
  const detailPath = resolve(cwd, "coverage/coverage-final.json");

  let summaryData: Record<string, any> = {};
  let detailData: Record<string, any> = {};

  try {
    summaryData = JSON.parse(await readFile(summaryPath, "utf-8"));
  } catch {
    return emptyResult(runner, "Coverage report not found. Check that coverage is enabled in your config.");
  }

  try {
    detailData = JSON.parse(await readFile(detailPath, "utf-8"));
  } catch {
    // detail report is optional
  }

  const diffPaths = new Set(diffFiles.map((f) => resolve(cwd, f.path)));
  const files: FileCoverage[] = [];
  const uncoveredFiles: string[] = [];

  const totals = {
    stmtTotal: 0, stmtCovered: 0,
    lineTotal: 0, lineCovered: 0,
    fnTotal: 0, fnCovered: 0,
    branchTotal: 0, branchCovered: 0,
  };

  for (const [absPath, data] of Object.entries(summaryData)) {
    if (absPath === "total") continue;

    const relPath = relative(cwd, absPath);
    if (!diffPaths.has(absPath) && !diffPaths.has(resolve(cwd, relPath))) {
      continue;
    }

    const s = data.statements;
    const l = data.lines;
    const f = data.functions;
    const b = data.branches;

    totals.stmtTotal += s.total;   totals.stmtCovered += s.covered;
    totals.lineTotal += l.total;   totals.lineCovered += l.covered;
    totals.fnTotal += f.total;     totals.fnCovered += f.covered;
    totals.branchTotal += b.total; totals.branchCovered += b.covered;

    const uncoveredLines = getUncoveredLines(detailData[absPath]);

    files.push({
      path: relPath,
      statements: { total: s.total, covered: s.covered, pct: s.pct },
      branches:   { total: b.total, covered: b.covered, pct: b.pct },
      functions:  { total: f.total, covered: f.covered, pct: f.pct },
      lines:      { total: l.total, covered: l.covered, pct: l.pct },
      uncoveredLines,
    });

    if (l.pct < 50) uncoveredFiles.push(relPath);
  }

  // Files in diff but absent from coverage report = 0% covered
  for (const df of diffFiles) {
    const abs = resolve(cwd, df.path);
    const inCoverage = files.some((f) => resolve(cwd, f.path) === abs);
    if (!inCoverage) {
      uncoveredFiles.push(df.path);
      files.push({
        path: df.path,
        statements: { total: 0, covered: 0, pct: 0 },
        branches:   { total: 0, covered: 0, pct: 0 },
        functions:  { total: 0, covered: 0, pct: 0 },
        lines:      { total: 0, covered: 0, pct: 0 },
        uncoveredLines: [],
      });
    }
  }

  const pct = (covered: number, total: number) =>
    total === 0 ? 0 : Math.round((covered / total) * 10000) / 100;

  return {
    runner,
    summary: {
      totalFiles: files.length,
      coveredFiles: files.filter((f) => f.lines.pct > 0).length,
      statements: { total: totals.stmtTotal, covered: totals.stmtCovered, pct: pct(totals.stmtCovered, totals.stmtTotal) },
      lines:      { total: totals.lineTotal, covered: totals.lineCovered, pct: pct(totals.lineCovered, totals.lineTotal) },
      functions:  { total: totals.fnTotal,   covered: totals.fnCovered,   pct: pct(totals.fnCovered, totals.fnTotal) },
      branches:   { total: totals.branchTotal, covered: totals.branchCovered, pct: pct(totals.branchCovered, totals.branchTotal) },
    },
    files,
    uncoveredFiles,
    timestamp: new Date().toISOString(),
  };
}

function getUncoveredLines(fileDetail: any): number[] {
  if (!fileDetail?.s) return [];
  const lines: Set<number> = new Set();
  for (const [id, count] of Object.entries(fileDetail.s)) {
    if ((count as number) === 0) {
      const loc = fileDetail.statementMap?.[id]?.start?.line;
      if (loc) lines.add(loc);
    }
  }
  return [...lines].sort((a, b) => a - b);
}

function emptyResult(runner: RunnerType, _message?: string): DiffCoverageResult {
  return {
    runner,
    summary: {
      totalFiles: 0,
      coveredFiles: 0,
      statements: { total: 0, covered: 0, pct: 0 },
      lines:      { total: 0, covered: 0, pct: 0 },
      functions:  { total: 0, covered: 0, pct: 0 },
      branches:   { total: 0, covered: 0, pct: 0 },
    },
    files: [],
    uncoveredFiles: [],
    timestamp: new Date().toISOString(),
  };
}

// ─── Formatter ────────────────────────────────────────────────────────────────

export function formatResult(result: DiffCoverageResult, threshold?: number): string {
  const { runner, summary, files } = result;
  const out: string[] = [];

  out.push(`=== Diff Coverage Report (${runner}) ===\n`);

  if (files.length === 0) {
    out.push("No diff files found or no coverage data available.");
    return out.join("\n");
  }

  out.push(`Files changed: ${summary.totalFiles}`);
  out.push(`Lines:      ${summary.lines.pct}% (${summary.lines.covered}/${summary.lines.total})`);
  out.push(`Statements: ${summary.statements.pct}% (${summary.statements.covered}/${summary.statements.total})`);
  out.push(`Functions:  ${summary.functions.pct}% (${summary.functions.covered}/${summary.functions.total})`);
  out.push(`Branches:   ${summary.branches.pct}% (${summary.branches.covered}/${summary.branches.total})`);

  if (threshold !== undefined) {
    const pass = summary.lines.pct >= threshold;
    out.push(`\nThreshold: ${threshold}% → ${pass ? "✅ PASS" : "❌ FAIL"}`);
  }

  out.push("\n--- Per File ---");
  for (const f of files) {
    const icon = f.lines.pct >= 80 ? "✅" : f.lines.pct >= 50 ? "⚠️" : "❌";
    out.push(`${icon} ${f.path}`);
    out.push(`   Lines: ${f.lines.pct}%  Stmts: ${f.statements.pct}%  Fns: ${f.functions.pct}%  Branches: ${f.branches.pct}%`);
    if (f.uncoveredLines.length > 0) {
      const preview = f.uncoveredLines.slice(0, 10).join(", ");
      const more = f.uncoveredLines.length > 10 ? ` ... (+${f.uncoveredLines.length - 10})` : "";
      out.push(`   Uncovered lines: ${preview}${more}`);
    }
  }

  return out.join("\n");
}
