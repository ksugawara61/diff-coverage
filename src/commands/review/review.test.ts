import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));
vi.mock("../../shared/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../shared/coverage.js", () => ({
  runCoverage: vi.fn(),
}));
vi.mock("../../shared/diff.js", () => ({
  getDiffFiles: vi.fn(),
}));

import { execa } from "execa";
import {
  type DiffCoverageResult,
  type FileCoverage,
  runCoverage,
} from "../../shared/coverage.js";
import { type DiffFile, getDiffFiles } from "../../shared/diff.js";
import type { GitHubReviewComment } from "../../shared/github.js";
import {
  buildMarker,
  buildPlannedComments,
  filterAlreadyPosted,
  formatReviewResult,
  groupUncoveredRanges,
  NoPullRequestError,
  type PlannedComment,
  type ReviewOutcome,
  renderCommentBody,
  renderReviewBody,
  runReview,
} from "./review.js";

const mockExeca = vi.mocked(execa);
const mockGetDiffFiles = vi.mocked(getDiffFiles);
const mockRunCoverage = vi.mocked(runCoverage);

const stubOk = (stdout: string) =>
  mockExeca.mockResolvedValueOnce({ stdout } as never);

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
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
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
      added: [10, 11, 12, 13, 20, 21, 22],
      expected: [
        { end: 12, start: 10 },
        { end: 22, start: 20 },
      ],
      name: "handles multiple separate ranges",
      uncovered: [10, 11, 12, 20, 21, 22],
    },
    {
      added: [5, 6, 7],
      expected: [],
      name: "returns empty when no uncovered lines",
      uncovered: [],
    },
    {
      added: [1, 5],
      expected: [
        { end: 1, start: 1 },
        { end: 5, start: 5 },
      ],
      name: "does not bridge across non-added gaps",
      uncovered: [1, 2, 3, 4, 5],
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
});

describe("filterAlreadyPosted", () => {
  const planned: PlannedComment[] = [
    {
      body: "ignored",
      endLine: 12,
      marker: "<!-- diff-coverage:auto:abc1234 -->",
      path: "src/a.ts",
      startLine: 10,
    },
    {
      body: "ignored",
      endLine: 5,
      marker: "<!-- diff-coverage:auto:def5678 -->",
      path: "src/b.ts",
      startLine: 5,
    },
  ];

  const existingComment = (body: string): GitHubReviewComment => ({
    body,
    id: 1,
    line: null,
    path: "src/a.ts",
    start_line: null,
  });

  it("skips planned comments whose marker already appears in existing comments", () => {
    const { kept, skipped } = filterAlreadyPosted(planned, [
      existingComment(
        "Earlier text\n<!-- diff-coverage:auto:abc1234 -->\nmore",
      ),
    ]);
    expect(skipped).toBe(1);
    expect(kept).toHaveLength(1);
    expect(kept[0].marker).toContain("def5678");
  });

  it("keeps everything when no markers match", () => {
    const { kept, skipped } = filterAlreadyPosted(planned, [
      existingComment("unrelated comment"),
    ]);
    expect(skipped).toBe(0);
    expect(kept).toHaveLength(2);
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

    // 1. ensureGhAuthenticated → gh auth status
    stubOk("Logged in");
    // 2. detectGitContext → git rev-parse --abbrev-ref HEAD
    stubOk("feature");
    // 3. detectGitContext → git config --get remote.origin.url
    stubOk("git@github.com:owner/repo.git");
    // 4. resolvePr → gh pr list
    stubOk(
      JSON.stringify([
        {
          baseRefName: "main",
          headRefName: "feature",
          headRefOid: "deadbeef",
          number: 42,
          state: "OPEN",
          url: "https://github.com/owner/repo/pull/42",
        },
      ]),
    );

    mockGetDiffFiles.mockResolvedValueOnce([
      diffFile({ addedLines, path: "src/foo.ts" }),
    ]);
    mockRunCoverage.mockResolvedValueOnce(
      coverageResult({
        files: [fileCoverage({ path: "src/foo.ts", uncoveredLines })],
      }),
    );
  };

  it("posts a review with planned comments on the happy path", async () => {
    mountSuccessfulPipeline();
    // 5. listReviewComments
    stubOk("");
    // 6. createReview
    stubOk(JSON.stringify({ html_url: "https://x/review/1", id: 999 }));

    const outcome = await runReview({ cwd: "/repo" });

    expect(outcome.posted).toHaveLength(1);
    expect(outcome.skippedExisting).toBe(0);
    expect(outcome.postedReviewUrl).toBe("https://x/review/1");
    expect(outcome.pr.number).toBe(42);

    const createReviewCall = mockExeca.mock.calls.at(-1);
    expect(createReviewCall?.[1]).toContain(
      "repos/owner/repo/pulls/42/reviews",
    );
    const opts = createReviewCall?.[2] as { input?: string };
    const payload = JSON.parse(opts?.input ?? "{}") as {
      comments: { line: number; path: string; start_line?: number }[];
      commit_id: string;
      event: string;
    };
    expect(payload.event).toBe("COMMENT");
    expect(payload.commit_id).toBe("deadbeef");
    expect(payload.comments[0]).toMatchObject({
      line: 12,
      path: "src/foo.ts",
      start_line: 10,
    });
  });

  it("throws NoPullRequestError when no PR is found", async () => {
    // 1. ensureGhAuthenticated
    stubOk("Logged in");
    // 2. branch
    stubOk("feature");
    // 3. remote url
    stubOk("git@github.com:owner/repo.git");
    // 4. gh pr list → empty
    stubOk("[]");

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
    // Only 4 gh/git calls (no listReviewComments, no createReview)
    expect(mockExeca).toHaveBeenCalledTimes(4);
  });

  it("skips comments whose marker already exists on the PR", async () => {
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
    const existingMarker = planned[0].marker;
    // listReviewComments returns the marker already
    stubOk(
      JSON.stringify({
        body: `existing ${existingMarker}`,
        id: 1,
        line: 12,
        path: "src/foo.ts",
        start_line: 10,
      }),
    );
    // createReview
    stubOk(JSON.stringify({ html_url: "https://x/review/2", id: 1000 }));

    const outcome = await runReview({ cwd: "/repo" });
    expect(outcome.skippedExisting).toBe(1);
    expect(outcome.posted).toHaveLength(0);
  });

  it("computes thresholdMet from coverage summary", async () => {
    mountSuccessfulPipeline();
    stubOk("");
    stubOk(JSON.stringify({ html_url: "https://x/review/3", id: 1001 }));

    const outcome = await runReview({ cwd: "/repo", threshold: 90 });
    // summary.lines.pct is 80 in factory; 80 < 90
    expect(outcome.thresholdMet).toBe(false);
  });
});
