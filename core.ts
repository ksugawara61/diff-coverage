import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { execa } from "execa";
import { detectRunner, type RunnerType } from "./runner/detect.js";
import { runJest } from "./runner/jest.js";
import { runVitest } from "./runner/vitest.js";

export type DiffFile = {
  addedLines: number[];
  additions: number;
  deletions: number;
  path: string;
};

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
  excludePatterns = DEFAULT_EXCLUDE,
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
    { cwd },
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
    { cwd },
  );

  const statMap = new Map<string, { additions: number; deletions: number }>();
  for (const line of diffStat.split("\n").filter(Boolean)) {
    const [add, del, file] = line.split("\t");
    statMap.set(file, {
      additions: Number.parseInt(add, 10) || 0,
      deletions: Number.parseInt(del, 10) || 0,
    });
  }

  const files: DiffFile[] = [];
  for (const filePath of allFiles) {
    const stat = statMap.get(filePath) ?? { additions: 0, deletions: 0 };
    const addedLines = await getAddedLines(cwd, baseRef, filePath);
    files.push({ addedLines, path: filePath, ...stat });
  }

  return files;
}

async function getAddedLines(
  cwd: string,
  base: string,
  filePath: string,
): Promise<number[]> {
  try {
    const { stdout } = await execa(
      "git",
      ["diff", base, "--unified=0", "--", filePath],
      { cwd },
    );

    const lines: number[] = [];
    let currentLine = 0;

    for (const line of stdout.split("\n")) {
      const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (hunkHeader) {
        currentLine = Number.parseInt(hunkHeader[1], 10);
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
  diffFiles: DiffFile[],
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

function addMissingDiffFiles(
  files: FileCoverage[],
  uncoveredFiles: string[],
  diffFiles: DiffFile[],
  cwd: string,
): void {
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
}

function computeFileCoverages(
  summaryData: CoverageSummary,
  detailData: CoverageDetail,
  cwd: string,
  diffFiles: DiffFile[],
): { files: FileCoverage[]; totals: Totals; uncoveredFiles: string[] } {
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
}

async function parseCoverageReport(
  cwd: string,
  diffFiles: DiffFile[],
  runner: RunnerType,
): Promise<DiffCoverageResult> {
  const summaryPath = resolve(cwd, "coverage/coverage-summary.json");
  const detailPath = resolve(cwd, "coverage/coverage-final.json");

  let summaryData: CoverageSummary = {};
  let detailData: CoverageDetail = {};

  try {
    summaryData = JSON.parse(
      await readFile(summaryPath, "utf-8"),
    ) as CoverageSummary;
  } catch {
    return emptyResult(
      runner,
      "Coverage report not found. Check that coverage is enabled in your config.",
    );
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
}

function getUncoveredLines(fileDetail: FileDetail | undefined): number[] {
  if (!fileDetail?.s) return [];
  const lines: Set<number> = new Set();
  for (const [id, count] of Object.entries(fileDetail.s)) {
    if (count === 0) {
      const loc = fileDetail.statementMap?.[id]?.start?.line;
      if (loc) lines.add(loc);
    }
  }
  return [...lines].sort((a, b) => a - b);
}

function emptyResult(
  runner: RunnerType,
  _message?: string,
): DiffCoverageResult {
  return {
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
  };
}

// ─── Typecheck ───────────────────────────────────────────────────────────────

export type TypecheckError = {
  code: string;
  column: number;
  file: string;
  line: number;
  message: string;
};

export type TypecheckFileResult = {
  errors: TypecheckError[];
  path: string;
};

export type TypecheckResult = {
  diffFiles: string[];
  files: TypecheckFileResult[];
  passed: boolean;
  timestamp: string;
  totalErrors: number;
};

export async function runTypecheck(
  cwd: string,
  diffFiles: DiffFile[],
  cmd?: string,
): Promise<TypecheckResult> {
  const fullCmd = cmd ?? "npx tsc --noEmit";
  const [bin, ...args] = fullCmd.split(" ");

  const result = await execa(bin, args, { cwd, reject: false });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

  const errorRegex = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;
  const allErrors: TypecheckError[] = [];
  let match: RegExpExecArray | null;

  while ((match = errorRegex.exec(output)) !== null) {
    const [, rawFile, line, column, code, message] = match;
    allErrors.push({
      code,
      column: Number.parseInt(column, 10),
      file: relative(cwd, resolve(cwd, rawFile)),
      line: Number.parseInt(line, 10),
      message,
    });
  }

  const diffPathSet = new Set(diffFiles.map((f) => f.path));
  const diffErrors = allErrors.filter((e) => diffPathSet.has(e.file));

  const errorsByFile = new Map<string, TypecheckError[]>();
  for (const err of diffErrors) {
    const existing = errorsByFile.get(err.file) ?? [];
    existing.push(err);
    errorsByFile.set(err.file, existing);
  }

  const files: TypecheckFileResult[] = diffFiles.map((df) => ({
    errors: errorsByFile.get(df.path) ?? [],
    path: df.path,
  }));

  return {
    diffFiles: diffFiles.map((f) => f.path),
    files,
    passed: diffErrors.length === 0,
    timestamp: new Date().toISOString(),
    totalErrors: diffErrors.length,
  };
}

export function formatTypecheckResult(result: TypecheckResult): string {
  const { files, passed, totalErrors } = result;
  const out: string[] = [];

  out.push("=== TypeScript Type-Check Report ===\n");

  if (files.length === 0) {
    out.push("No changed TypeScript files found.");
    return out.join("\n");
  }

  out.push(`Files checked: ${files.length}`);
  out.push(`Total errors: ${totalErrors}`);
  out.push(`Status: ${passed ? "✅ PASS" : "❌ FAIL"}`);

  if (totalErrors > 0) {
    out.push("\n--- Errors by File ---");
    for (const f of files) {
      if (f.errors.length === 0) continue;
      out.push(
        `\n❌ ${f.path} (${f.errors.length} error${f.errors.length > 1 ? "s" : ""})`,
      );
      for (const err of f.errors) {
        out.push(`   ${err.line}:${err.column}  ${err.code}  ${err.message}`);
      }
    }
  }

  return out.join("\n");
}

// ─── Formatter ────────────────────────────────────────────────────────────────

function getCoverageIcon(pct: number): string {
  if (pct >= 80) return "✅";
  if (pct >= 50) return "⚠️";
  return "❌";
}

export function formatResult(
  result: DiffCoverageResult,
  threshold?: number,
): string {
  const { files, runner, summary } = result;
  const out: string[] = [];

  out.push(`=== Diff Coverage Report (${runner}) ===\n`);

  if (files.length === 0) {
    out.push("No diff files found or no coverage data available.");
    return out.join("\n");
  }

  out.push(`Files changed: ${summary.totalFiles}`);
  out.push(
    `Lines:      ${summary.lines.pct}% (${summary.lines.covered}/${summary.lines.total})`,
  );
  out.push(
    `Statements: ${summary.statements.pct}% (${summary.statements.covered}/${summary.statements.total})`,
  );
  out.push(
    `Functions:  ${summary.functions.pct}% (${summary.functions.covered}/${summary.functions.total})`,
  );
  out.push(
    `Branches:   ${summary.branches.pct}% (${summary.branches.covered}/${summary.branches.total})`,
  );

  if (threshold !== undefined) {
    const pass = summary.lines.pct >= threshold;
    out.push(`\nThreshold: ${threshold}% → ${pass ? "✅ PASS" : "❌ FAIL"}`);
  }

  out.push("\n--- Per File ---");
  for (const f of files) {
    const icon = getCoverageIcon(f.lines.pct);
    out.push(`${icon} ${f.path}`);
    out.push(
      `   Lines: ${f.lines.pct}%  Stmts: ${f.statements.pct}%  Fns: ${f.functions.pct}%  Branches: ${f.branches.pct}%`,
    );
    if (f.uncoveredLines.length > 0) {
      const preview = f.uncoveredLines.slice(0, 10).join(", ");
      const more =
        f.uncoveredLines.length > 10
          ? ` ... (+${f.uncoveredLines.length - 10})`
          : "";
      out.push(`   Uncovered lines: ${preview}${more}`);
    }
  }

  return out.join("\n");
}
