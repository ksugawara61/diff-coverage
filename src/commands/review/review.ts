import { createHash } from "node:crypto";
import { execa } from "execa";
import type {
  DiffCoverageResult,
  FileCoverage,
  RunOptions,
} from "../../shared/coverage.js";
import type { DiffFile } from "../../shared/diff.js";
import {
  createReview,
  ensureGhAuthenticated,
  findPullRequestByBranch,
  type GitHubPullRequest,
  type GitHubReviewComment,
  getPullRequest,
  listReviewComments,
  parseRepoSlug,
  type ReviewCommentInput,
} from "../../shared/github.js";
import { runMeasure } from "../measure/measure.js";

export type ReviewOptions = {
  base?: string;
  cwd: string;
  dryRun?: boolean;
  exclude?: string[];
  extensions?: string[];
  pr?: number;
  runner?: RunOptions["runner"];
  threshold?: number;
};

export type Range = { end: number; start: number };

export type PlannedComment = {
  body: string;
  endLine: number;
  marker: string;
  path: string;
  startLine: number;
};

export type ReviewOutcome = {
  coverage: DiffCoverageResult;
  dryRun: boolean;
  planned: PlannedComment[];
  posted: PlannedComment[];
  postedReviewUrl?: string;
  pr: { headSha: string; number: number; url: string };
  skippedExisting: number;
  thresholdMet: boolean | null;
};

export class NoPullRequestError extends Error {
  code = "NO_PR" as const;
  constructor(branch: string) {
    super(
      `No open pull request found for branch "${branch}". Push the branch first or pass --pr.`,
    );
    this.name = "NoPullRequestError";
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

export const groupUncoveredRanges = (
  uncoveredLines: number[],
  addedLines: number[],
): Range[] => {
  const addedSet = new Set(addedLines);
  const candidates = uncoveredLines
    .filter((n) => addedSet.has(n))
    .sort((a, b) => a - b);
  return candidates.reduce<Range[]>((acc, n) => {
    const last = acc.at(-1);
    if (last && last.end + 1 === n) {
      last.end = n;
    } else {
      acc.push({ end: n, start: n });
    }
    return acc;
  }, []);
};

export const buildMarker = (
  path: string,
  startLine: number,
  endLine: number,
): string => {
  const hash = createHash("sha256")
    .update(`${path}:${startLine}:${endLine}`)
    .digest("hex")
    .slice(0, 7);
  return `<!-- diff-coverage:auto:${hash} -->`;
};

export const renderCommentBody = (args: {
  endLine: number;
  marker: string;
  path: string;
  startLine: number;
}): string => {
  const { startLine, endLine, marker } = args;
  if (startLine === endLine) {
    return [
      marker,
      `**Uncovered by tests** (line ${startLine})`,
      "",
      "This line was added in this PR but no test exercises it. Add coverage for this code path.",
      "",
      "_Posted by `diff-coverage`._",
    ].join("\n");
  }
  const count = endLine - startLine + 1;
  return [
    marker,
    `**Uncovered by tests** (lines ${startLine}–${endLine})`,
    "",
    `These ${count} added lines are not exercised by any test. Add coverage for this block.`,
    "",
    "_Posted by `diff-coverage`._",
  ].join("\n");
};

const renderFilesBelowThreshold = (
  files: FileCoverage[],
  threshold: number,
): string[] => {
  const below = files.filter((f) => f.lines.pct < threshold);
  if (below.length === 0) return [];
  return [
    "",
    "Files below threshold:",
    ...below.map((f) => `- \`${f.path}\` — ${f.lines.pct}%`),
  ];
};

export const renderReviewBody = (
  result: DiffCoverageResult,
  threshold?: number,
): string => {
  const { summary } = result;
  const lines: string[] = [
    "## Diff coverage report",
    "",
    `- Lines: **${summary.lines.pct}%** (${summary.lines.covered}/${summary.lines.total})`,
    `- Files changed: ${summary.totalFiles}`,
  ];
  if (threshold !== undefined) {
    const pass = summary.lines.pct >= threshold;
    lines.push(
      `- Threshold: ${threshold}% — ${pass ? "✅ pass" : "⚠️ below threshold"}`,
    );
    lines.push(...renderFilesBelowThreshold(result.files, threshold));
  }
  lines.push("", "<!-- diff-coverage:auto:summary -->");
  return lines.join("\n");
};

export const buildPlannedComments = (
  result: DiffCoverageResult,
  diffFiles: DiffFile[],
): PlannedComment[] => {
  const addedByPath = new Map(diffFiles.map((d) => [d.path, d.addedLines]));
  return result.files.flatMap((f) => {
    const added = addedByPath.get(f.path) ?? [];
    const ranges = groupUncoveredRanges(f.uncoveredLines, added);
    return ranges.map((r) => {
      const marker = buildMarker(f.path, r.start, r.end);
      return {
        body: renderCommentBody({
          endLine: r.end,
          marker,
          path: f.path,
          startLine: r.start,
        }),
        endLine: r.end,
        marker,
        path: f.path,
        startLine: r.start,
      };
    });
  });
};

export const filterAlreadyPosted = (
  planned: PlannedComment[],
  existing: GitHubReviewComment[],
): { kept: PlannedComment[]; skipped: number } => {
  const existingMarkers = new Set(
    existing
      .map((c) => c.body.match(/<!-- diff-coverage:auto:[a-f0-9]{7} -->/)?.[0])
      .filter((m): m is string => m !== undefined),
  );
  const kept = planned.filter((p) => !existingMarkers.has(p.marker));
  return { kept, skipped: planned.length - kept.length };
};

const toReviewCommentInput = (p: PlannedComment): ReviewCommentInput =>
  p.startLine === p.endLine
    ? { body: p.body, line: p.endLine, path: p.path, side: "RIGHT" }
    : {
        body: p.body,
        line: p.endLine,
        path: p.path,
        side: "RIGHT",
        start_line: p.startLine,
        start_side: "RIGHT",
      };

const renderThresholdLine = (met: boolean | null): string | null => {
  if (met === null) return null;
  return met ? "Threshold: ✅ PASS" : "Threshold: ❌ FAIL";
};

const renderPostedSection = (outcome: ReviewOutcome): string[] => {
  if (outcome.dryRun) return ["Mode: dry-run (nothing posted)"];
  if (!outcome.postedReviewUrl) return [];
  return [
    `Posted review: ${outcome.postedReviewUrl}`,
    `Newly posted comments: ${outcome.posted.length}`,
  ];
};

export const formatReviewResult = (outcome: ReviewOutcome): string => {
  const thresholdLine = renderThresholdLine(outcome.thresholdMet);
  const sections: (string | null)[] = [
    "=== diff-coverage PR review ===",
    "",
    `PR: #${outcome.pr.number} ${outcome.pr.url}`,
    `Head SHA: ${outcome.pr.headSha}`,
    `Coverage: ${outcome.coverage.summary.lines.pct}% (${outcome.coverage.summary.lines.covered}/${outcome.coverage.summary.lines.total})`,
    thresholdLine,
    "",
    `Planned inline comments: ${outcome.planned.length}`,
    `Skipped (already posted): ${outcome.skippedExisting}`,
    ...renderPostedSection(outcome),
  ];
  return sections.filter((s): s is string => s !== null).join("\n");
};

// ─── Git context ─────────────────────────────────────────────────────────────

export const detectGitContext = async (
  cwd: string,
): Promise<{ branch: string; remoteUrl: string }> => {
  const branchResult = await execa(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    {
      cwd,
    },
  );
  const branch = branchResult.stdout.trim();
  const remoteResult = await execa(
    "git",
    ["config", "--get", "remote.origin.url"],
    { cwd },
  );
  const remoteUrl = remoteResult.stdout.trim();
  return { branch, remoteUrl };
};

// ─── Orchestration ───────────────────────────────────────────────────────────

const resolvePr = async (args: {
  branch: string;
  cwd: string;
  override?: number;
  owner: string;
  repo: string;
}): Promise<GitHubPullRequest> => {
  if (args.override !== undefined) {
    return getPullRequest({
      cwd: args.cwd,
      owner: args.owner,
      pullNumber: args.override,
      repo: args.repo,
    });
  }
  const pr = await findPullRequestByBranch({
    branch: args.branch,
    cwd: args.cwd,
    owner: args.owner,
    repo: args.repo,
  });
  if (!pr) throw new NoPullRequestError(args.branch);
  return pr;
};

const postReview = async (args: {
  cwd: string;
  kept: PlannedComment[];
  owner: string;
  pr: GitHubPullRequest;
  repo: string;
  reviewBody: string;
}): Promise<string> => {
  const result = await createReview({
    body: args.reviewBody,
    comments: args.kept.map(toReviewCommentInput),
    commitId: args.pr.headRefOid,
    cwd: args.cwd,
    owner: args.owner,
    pullNumber: args.pr.number,
    repo: args.repo,
  });
  return result.html_url;
};

export const runReview = async (
  opts: ReviewOptions,
): Promise<ReviewOutcome> => {
  await ensureGhAuthenticated();
  const { branch, remoteUrl } = await detectGitContext(opts.cwd);
  const { owner, repo } = parseRepoSlug(remoteUrl);
  const pr = await resolvePr({
    branch,
    cwd: opts.cwd,
    override: opts.pr,
    owner,
    repo,
  });
  const { coverage, diffFiles, thresholdMet } = await runMeasure({
    base: opts.base,
    cwd: opts.cwd,
    exclude: opts.exclude,
    extensions: opts.extensions,
    runner: opts.runner,
    threshold: opts.threshold,
  });
  const planned = buildPlannedComments(coverage, diffFiles);
  const reviewBody = renderReviewBody(coverage, opts.threshold);
  const prInfo = { headSha: pr.headRefOid, number: pr.number, url: pr.url };

  if (opts.dryRun) {
    return {
      coverage,
      dryRun: true,
      planned,
      posted: [],
      pr: prInfo,
      skippedExisting: 0,
      thresholdMet,
    };
  }

  const existing = await listReviewComments({
    cwd: opts.cwd,
    owner,
    pullNumber: pr.number,
    repo,
  });
  const { kept, skipped } = filterAlreadyPosted(planned, existing);

  const postedReviewUrl = await postReview({
    cwd: opts.cwd,
    kept,
    owner,
    pr,
    repo,
    reviewBody,
  });

  return {
    coverage,
    dryRun: false,
    planned,
    posted: kept,
    postedReviewUrl,
    pr: prInfo,
    skippedExisting: skipped,
    thresholdMet,
  };
};
