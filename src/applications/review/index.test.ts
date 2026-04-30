import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/git.js", () => ({
  getCurrentBranch: vi.fn(),
  getRemoteOriginUrl: vi.fn(),
}));
vi.mock("../../repositories/github.js", () => ({
  createReview: vi.fn(),
  createReviewCommentSingle: vi.fn(),
  ensureGhAuthenticated: vi.fn(),
  findPullRequestByBranch: vi.fn(),
  getPullRequest: vi.fn(),
  listPullRequestReviews: vi.fn().mockResolvedValue([]),
  listReviewComments: vi.fn().mockResolvedValue([]),
  parseRepoSlug: vi.fn().mockReturnValue({ owner: "owner", repo: "repo" }),
  updateReview: vi.fn(),
  updateReviewComment: vi.fn(),
}));
vi.mock("../measure/index.js", () => ({
  runMeasure: vi.fn(),
}));

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
  type GitHubReviewComment,
  listPullRequestReviews,
  listReviewComments,
  updateReview,
  updateReviewComment,
} from "../../repositories/github.js";
import type { DiffCoverageResult, FileCoverage } from "../measure/coverage.js";
import { runMeasure } from "../measure/index.js";
import {
  buildMarker,
  buildPlannedComments,
  categorizeComments,
  formatReviewResult,
  groupUncoveredRanges,
  NoPullRequestError,
  type PlannedComment,
  type ReviewOutcome,
  renderCommentBody,
  renderReviewBody,
  runReview,
} from "./index.js";

const mockGetCurrentBranch = vi.mocked(getCurrentBranch);
const mockGetRemoteOriginUrl = vi.mocked(getRemoteOriginUrl);
const mockEnsureGhAuthenticated = vi.mocked(ensureGhAuthenticated);
const mockFindPullRequestByBranch = vi.mocked(findPullRequestByBranch);
const mockCreateReview = vi.mocked(createReview);
const mockCreateReviewCommentSingle = vi.mocked(createReviewCommentSingle);
const mockListPullRequestReviews = vi.mocked(listPullRequestReviews);
const mockListReviewComments = vi.mocked(listReviewComments);
const mockUpdateReview = vi.mocked(updateReview);
const mockUpdateReviewComment = vi.mocked(updateReviewComment);
const mockRunMeasure = vi.mocked(runMeasure);

const fileCoverage = (overrides: Partial<FileCoverage> = {}): FileCoverage => ({
  branches: { covered: 0, pct: 0, total: 0 },
  functions: { covered: 0, pct: 0, total: 0 },
  lines: { covered: 0, pct: 0, total: 0 },
  path: "src/foo.ts",
  statements: { covered: 0, pct: 0, total: 0 },
  uncoveredLines: [],
  ...overrides,
});

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
  repoPath: "src/foo.ts",
  ...overrides,
});

const makePr = (overrides = {}) => ({
  baseRefName: "main",
  headRefName: "feature",
  headRefOid: "deadbeef",
  number: 42,
  state: "OPEN" as const,
  url: "https://github.com/owner/repo/pull/42",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockEnsureGhAuthenticated.mockResolvedValue(undefined);
  mockGetCurrentBranch.mockResolvedValue("feature");
  mockGetRemoteOriginUrl.mockResolvedValue("git@github.com:owner/repo.git");
  mockFindPullRequestByBranch.mockResolvedValue(makePr());
  mockListReviewComments.mockResolvedValue([]);
  mockListPullRequestReviews.mockResolvedValue([]);
  mockCreateReview.mockResolvedValue({
    html_url: "https://x/review/1",
    id: 999,
  });
  mockUpdateReview.mockResolvedValue({
    html_url: "https://x/review/1",
    id: 999,
  });
  mockUpdateReviewComment.mockResolvedValue(undefined);
  mockCreateReviewCommentSingle.mockResolvedValue(undefined);
});

describe("groupUncoveredRanges", () => {
  it.each([
    {
      added: [1, 2, 3, 4, 5],
      expected: [{ end: 3, start: 1 }],
      name: "merges consecutive uncovered lines",
      uncovered: [1, 2, 3],
    },
    {
      added: [1, 2, 3, 4, 5],
      expected: [
        { end: 1, start: 1 },
        { end: 3, start: 3 },
        { end: 5, start: 5 },
      ],
      name: "splits non-consecutive uncovered lines",
      uncovered: [1, 3, 5],
    },
    {
      added: [5, 6, 7],
      expected: [],
      name: "returns empty when no uncovered lines",
      uncovered: [],
    },
  ])("$name", ({ uncovered, added, expected }) => {
    expect(groupUncoveredRanges(uncovered, added)).toEqual(expected);
  });

  it("filters out uncovered lines not in addedLines", () => {
    expect(groupUncoveredRanges([1, 2, 3], [2])).toEqual([
      { end: 2, start: 2 },
    ]);
  });
});

describe("buildMarker", () => {
  it("is deterministic for the same input", () => {
    expect(buildMarker("src/foo.ts", 10, 20)).toBe(
      buildMarker("src/foo.ts", 10, 20),
    );
  });

  it("differs when path or range changes", () => {
    const a = buildMarker("src/foo.ts", 10, 20);
    const b = buildMarker("src/foo.ts", 10, 21);
    const c = buildMarker("src/bar.ts", 10, 20);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("renderCommentBody", () => {
  it("renders single-line body", () => {
    const body = renderCommentBody({
      endLine: 42,
      marker: "<!-- mark -->",
      path: "src/foo.ts",
      startLine: 42,
    });
    expect(body).toContain("(line 42)");
    expect(body).toContain("<!-- mark -->");
  });

  it("renders multi-line body with line count", () => {
    const body = renderCommentBody({
      endLine: 47,
      marker: "<!-- mark -->",
      path: "src/foo.ts",
      startLine: 42,
    });
    expect(body).toContain("lines 42–47");
    expect(body).toContain("These 6 added lines");
  });
});

describe("buildPlannedComments", () => {
  it("emits one comment per uncovered range and intersects with addedLines", () => {
    const result = coverageResult({
      files: [
        fileCoverage({
          path: "src/foo.ts",
          uncoveredLines: [10, 11, 12, 50],
        }),
      ],
    });
    const planned = buildPlannedComments(result, [
      diffFile({ addedLines: [10, 11, 12, 50] }),
    ]);

    expect(planned).toHaveLength(2);
    expect(planned[0]).toMatchObject({
      endLine: 12,
      path: "src/foo.ts",
      startLine: 10,
    });
    expect(planned[1]).toMatchObject({
      endLine: 50,
      path: "src/foo.ts",
      startLine: 50,
    });
  });

  it("uses repoPath as the comment path when cwd differs from repo root", () => {
    const result = coverageResult({
      files: [
        fileCoverage({
          path: "src/foo.ts",
          uncoveredLines: [10],
        }),
      ],
    });
    const planned = buildPlannedComments(result, [
      diffFile({
        addedLines: [10],
        path: "src/foo.ts",
        repoPath: "packages/mylib/src/foo.ts",
      }),
    ]);

    expect(planned).toHaveLength(1);
    expect(planned[0].path).toBe("packages/mylib/src/foo.ts");
  });
});

describe("categorizeComments", () => {
  const body =
    "<!-- diff-coverage:auto:abc1234 -->\n**Uncovered by tests** (line 10)";
  const planned: PlannedComment[] = [
    {
      body,
      endLine: 12,
      marker: "<!-- diff-coverage:auto:abc1234 -->",
      path: "src/a.ts",
      startLine: 10,
    },
    {
      body: "<!-- diff-coverage:auto:def5678 -->\n**Uncovered by tests** (line 5)",
      endLine: 5,
      marker: "<!-- diff-coverage:auto:def5678 -->",
      path: "src/b.ts",
      startLine: 5,
    },
  ];

  const existingComment = (
    commentBody: string,
    id = 1,
  ): GitHubReviewComment => ({
    body: commentBody,
    id,
    line: null,
    path: "src/a.ts",
    start_line: null,
  });

  it("puts new comments in toCreate when no marker matches", () => {
    const { toCreate, toUpdate, skipped } = categorizeComments(planned, [
      existingComment("unrelated comment"),
    ]);
    expect(toCreate).toHaveLength(2);
    expect(toUpdate).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it("skips comments whose marker and body are identical", () => {
    const { toCreate, toUpdate, skipped } = categorizeComments(planned, [
      existingComment(body, 1),
    ]);
    expect(skipped).toBe(1);
    expect(toCreate).toHaveLength(1);
    expect(toCreate[0].marker).toContain("def5678");
    expect(toUpdate).toHaveLength(0);
  });

  it("puts comments in toUpdate when marker matches but body differs", () => {
    const { toCreate, toUpdate, skipped } = categorizeComments(planned, [
      existingComment("<!-- diff-coverage:auto:abc1234 -->\nOld body", 42),
    ]);
    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0].id).toBe(42);
    expect(toUpdate[0].comment.marker).toContain("abc1234");
    expect(toCreate).toHaveLength(1);
    expect(skipped).toBe(0);
  });
});

describe("renderReviewBody", () => {
  it("includes summary and threshold pass/fail line", () => {
    const body = renderReviewBody(coverageResult(), 90);
    expect(body).toContain("Diff coverage report");
    expect(body).toContain("Threshold: 90%");
    expect(body).toContain("⚠️ below threshold");
    expect(body).toContain("<!-- diff-coverage:auto:summary -->");
  });

  it("omits threshold line when threshold is undefined", () => {
    const body = renderReviewBody(coverageResult());
    expect(body).not.toContain("Threshold:");
  });
});

describe("formatReviewResult", () => {
  const baseOutcome = (
    overrides: Partial<ReviewOutcome> = {},
  ): ReviewOutcome => ({
    coverage: coverageResult(),
    dryRun: false,
    planned: [],
    posted: [],
    pr: { headSha: "sha", number: 1, url: "https://x/pr/1" },
    skippedExisting: 0,
    thresholdMet: null,
    updatedExisting: 0,
    ...overrides,
  });

  it.each([
    {
      expected: "Threshold: ✅ PASS",
      name: "threshold met",
      thresholdMet: true,
    },
    {
      expected: "Threshold: ❌ FAIL",
      name: "threshold not met",
      thresholdMet: false,
    },
  ])("renders $name", ({ thresholdMet, expected }) => {
    expect(formatReviewResult(baseOutcome({ thresholdMet }))).toContain(
      expected,
    );
  });

  it("renders dry-run mode when dryRun is true", () => {
    expect(formatReviewResult(baseOutcome({ dryRun: true }))).toContain(
      "dry-run",
    );
  });

  it("includes posted review URL when present", () => {
    const out = formatReviewResult(
      baseOutcome({ postedReviewUrl: "https://x/review/9" }),
    );
    expect(out).toContain("Posted review: https://x/review/9");
  });
});

describe("runReview", () => {
  const mountSuccessfulPipeline = (overrides?: {
    addedLines?: number[];
    uncoveredLines?: number[];
  }) => {
    const addedLines = overrides?.addedLines ?? [10, 11, 12];
    const uncoveredLines = overrides?.uncoveredLines ?? [10, 11, 12];

    mockRunMeasure.mockResolvedValueOnce({
      coverage: coverageResult({
        files: [fileCoverage({ path: "src/foo.ts", uncoveredLines })],
      }),
      diffFiles: [diffFile({ addedLines, path: "src/foo.ts" })],
      thresholdMet: null,
    });
  };

  it("posts a review with planned comments on the happy path", async () => {
    mountSuccessfulPipeline();

    const outcome = await runReview({ cwd: "/repo" });

    expect(outcome.posted).toHaveLength(1);
    expect(outcome.skippedExisting).toBe(0);
    expect(outcome.postedReviewUrl).toBe("https://x/review/1");
    expect(outcome.pr.number).toBe(42);

    expect(mockCreateReview).toHaveBeenCalledWith(
      expect.objectContaining({
        comments: expect.arrayContaining([
          expect.objectContaining({
            line: 12,
            path: "src/foo.ts",
            start_line: 10,
          }),
        ]),
        commitId: "deadbeef",
        owner: "owner",
        pullNumber: 42,
        repo: "repo",
      }),
    );
  });

  it("throws NoPullRequestError when no PR is found", async () => {
    mockFindPullRequestByBranch.mockResolvedValueOnce(null);

    await expect(runReview({ cwd: "/repo" })).rejects.toBeInstanceOf(
      NoPullRequestError,
    );
  });

  it("does not call createReview in dryRun mode", async () => {
    mountSuccessfulPipeline();

    const outcome = await runReview({ cwd: "/repo", dryRun: true });

    expect(outcome.dryRun).toBe(true);
    expect(outcome.posted).toEqual([]);
    expect(outcome.planned).toHaveLength(1);
    expect(mockCreateReview).not.toHaveBeenCalled();
  });

  it("skips comments whose marker and body are already identical on the PR", async () => {
    mountSuccessfulPipeline();
    const planned = buildPlannedComments(
      coverageResult({
        files: [
          fileCoverage({
            path: "src/foo.ts",
            uncoveredLines: [10, 11, 12],
          }),
        ],
      }),
      [diffFile({ addedLines: [10, 11, 12], path: "src/foo.ts" })],
    );
    mockListReviewComments.mockResolvedValueOnce([
      {
        body: planned[0].body,
        id: 1,
        line: 12,
        path: "src/foo.ts",
        start_line: 10,
      },
    ]);

    const outcome = await runReview({ cwd: "/repo" });
    expect(outcome.skippedExisting).toBe(1);
    expect(outcome.posted).toHaveLength(0);
    expect(outcome.updatedExisting).toBe(0);
  });

  it("updates comments whose marker matches but body has changed", async () => {
    mountSuccessfulPipeline();
    const planned = buildPlannedComments(
      coverageResult({
        files: [
          fileCoverage({
            path: "src/foo.ts",
            uncoveredLines: [10, 11, 12],
          }),
        ],
      }),
      [diffFile({ addedLines: [10, 11, 12], path: "src/foo.ts" })],
    );
    mockListReviewComments.mockResolvedValueOnce([
      {
        body: `${planned[0].marker}\nOld body`,
        id: 77,
        line: 12,
        path: "src/foo.ts",
        start_line: 10,
      },
    ]);

    const outcome = await runReview({ cwd: "/repo" });
    expect(outcome.updatedExisting).toBe(1);
    expect(outcome.posted).toHaveLength(0);
    expect(mockUpdateReviewComment).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: 77 }),
    );
  });

  it("updates existing review body and posts standalone comments when summary review exists", async () => {
    mountSuccessfulPipeline();
    mockListPullRequestReviews.mockResolvedValueOnce([
      {
        body: "## Diff coverage report\n\n<!-- diff-coverage:auto:summary -->",
        html_url: "https://x/review/1",
        id: 55,
        state: "COMMENTED",
      },
    ]);

    const outcome = await runReview({ cwd: "/repo" });
    expect(mockUpdateReview).toHaveBeenCalledWith(
      expect.objectContaining({ reviewId: 55 }),
    );
    expect(mockCreateReview).not.toHaveBeenCalled();
    expect(mockCreateReviewCommentSingle).toHaveBeenCalledTimes(1);
    expect(outcome.postedReviewUrl).toBe("https://x/review/1");
  });

  it("computes thresholdMet from runMeasure result", async () => {
    mockRunMeasure.mockResolvedValueOnce({
      coverage: coverageResult(),
      diffFiles: [diffFile()],
      thresholdMet: false,
    });

    const outcome = await runReview({ cwd: "/repo", threshold: 90 });
    expect(outcome.thresholdMet).toBe(false);
  });
});
