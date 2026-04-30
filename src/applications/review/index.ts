import { createHash } from "node:crypto";
import {
  type DiffFile,
  getCurrentBranch,
  getRemoteOriginUrl,
} from "../../repositories/git.js";
import {
  createReview,
  createReviewCommentSingle,
  ensureGhAuthenticated,
  findPullRequestByBranch,
  type GitHubPullRequest,
  type GitHubReviewComment,
  getPullRequest,
  listPullRequestReviews,
  listReviewComments,
  parseRepoSlug,
  type ReviewCommentInput,
  updateReview,
  updateReviewComment,
} from "../../repositories/github.js";
import type {
  DiffCoverageResult,
  FileCoverage,
  RunOptions,
} from "../measure/coverage.js";
import { runMeasure } from "../measure/index.js";

type ReviewOptions = {
  base?: string;
  cwd: string;
  dryRun?: boolean;
  exclude?: string[];
  extensions?: string[];
  pr?: number;
  runner?: RunOptions["runner"];
  threshold?: number;
};

type Range = { end: number; start: number };

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
  updatedExisting: number;
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
  const addedByPath = new Map(
    diffFiles.map((d) => [
      d.path,
      { addedLines: d.addedLines, repoPath: d.repoPath },
    ]),
  );
  return result.files.flatMap((f) => {
    const info = addedByPath.get(f.path);
    const added = info?.addedLines ?? [];
    const repoPath = info?.repoPath ?? f.path;
    const ranges = groupUncoveredRanges(f.uncoveredLines, added);
    return ranges.map((r) => {
      const marker = buildMarker(repoPath, r.start, r.end);
      return {
        body: renderCommentBody({
          endLine: r.end,
          marker,
          path: repoPath,
          startLine: r.start,
        }),
        endLine: r.end,
        marker,
        path: repoPath,
        startLine: r.start,
      };
    });
  });
};

type CommentToUpdate = { comment: PlannedComment; id: number };

export type CategorizedComments = {
  skipped: number;
  toCreate: PlannedComment[];
  toUpdate: CommentToUpdate[];
};

export const categorizeComments = (
  planned: PlannedComment[],
  existing: GitHubReviewComment[],
): CategorizedComments => {
  const existingByMarker = new Map(
    existing
      .map((c) => {
        const m = c.body.match(/<!-- diff-coverage:auto:[a-f0-9]{7} -->/)?.[0];
        return m ? ([m, c] as [string, GitHubReviewComment]) : null;
      })
      .filter(
        (entry): entry is [string, GitHubReviewComment] => entry !== null,
      ),
  );
  return planned.reduce<CategorizedComments>(
    (acc, p) => {
      const found = existingByMarker.get(p.marker);
      if (!found) {
        acc.toCreate.push(p);
      } else if (found.body !== p.body) {
        acc.toUpdate.push({ comment: p, id: found.id });
      } else {
        acc.skipped++;
      }
      return acc;
    },
    { skipped: 0, toCreate: [], toUpdate: [] },
  );
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
    `Updated (body changed): ${outcome.updatedExisting}`,
    ...renderPostedSection(outcome),
  ];
  return sections.filter((s): s is string => s !== null).join("\n");
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

export const runReview = async (
  opts: ReviewOptions,
): Promise<ReviewOutcome> => {
  await ensureGhAuthenticated();
  const branch = await getCurrentBranch(opts.cwd);
  const remoteUrl = await getRemoteOriginUrl(opts.cwd);
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
      updatedExisting: 0,
    };
  }

  const [existingComments, existingReviews] = await Promise.all([
    listReviewComments({ cwd: opts.cwd, owner, pullNumber: pr.number, repo }),
    listPullRequestReviews({
      cwd: opts.cwd,
      owner,
      pullNumber: pr.number,
      repo,
    }),
  ]);

  const { toCreate, toUpdate, skipped } = categorizeComments(
    planned,
    existingComments,
  );

  const summaryReview = existingReviews
    .filter((r) => r.body.includes("<!-- diff-coverage:auto:summary -->"))
    .at(-1);

  await Promise.all(
    toUpdate.map(({ comment, id }) =>
      updateReviewComment({
        body: comment.body,
        commentId: id,
        cwd: opts.cwd,
        owner,
        repo,
      }),
    ),
  );

  let postedReviewUrl: string;

  if (summaryReview) {
    const updated = await updateReview({
      body: reviewBody,
      cwd: opts.cwd,
      owner,
      pullNumber: pr.number,
      repo,
      reviewId: summaryReview.id,
    });
    postedReviewUrl = updated.html_url;
    await Promise.all(
      toCreate.map((p) =>
        createReviewCommentSingle({
          comment: toReviewCommentInput(p),
          commitId: pr.headRefOid,
          cwd: opts.cwd,
          owner,
          pullNumber: pr.number,
          repo,
        }),
      ),
    );
  } else {
    const result = await createReview({
      body: reviewBody,
      comments: toCreate.map(toReviewCommentInput),
      commitId: pr.headRefOid,
      cwd: opts.cwd,
      owner,
      pullNumber: pr.number,
      repo,
    });
    postedReviewUrl = result.html_url;
  }

  return {
    coverage,
    dryRun: false,
    planned,
    posted: toCreate,
    postedReviewUrl,
    pr: prInfo,
    skippedExisting: skipped,
    thresholdMet,
    updatedExisting: toUpdate.length,
  };
};
