import type { DiffCoverageResult } from "./coverage.js";

type PackageResult = {
  cwd: string;
  outcome: { coverage: DiffCoverageResult };
  relCwd: string;
};

const getCoverageIcon = (pct: number): string => {
  if (pct >= 80) return "✅";
  if (pct >= 50) return "⚠️";
  return "❌";
};

export const formatResult = (
  result: DiffCoverageResult,
  threshold?: number,
): string => {
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
};

export const formatMonorepoResult = (
  packages: PackageResult[],
  threshold?: number,
): string =>
  packages
    .map(
      (p) => `📦 ${p.relCwd}\n${formatResult(p.outcome.coverage, threshold)}`,
    )
    .join("\n\n---\n\n");
