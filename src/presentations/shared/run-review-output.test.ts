import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../applications/review/index.js", () => ({
  formatReviewResult: vi.fn().mockReturnValue("=== review result ==="),
  NoPullRequestError: class NoPullRequestError extends Error {
    code = "NO_PR" as const;
    constructor(branch: string) {
      super(`No open pull request found for branch "${branch}".`);
      this.name = "NoPullRequestError";
    }
  },
  runReview: vi.fn(),
}));
vi.mock("../../repositories/github.js", () => ({
  GhNotAuthenticatedError: class GhNotAuthenticatedError extends Error {
    constructor() {
      super("gh is not authenticated");
      this.name = "GhNotAuthenticatedError";
    }
  },
  GhNotInstalledError: class GhNotInstalledError extends Error {
    constructor() {
      super("gh is not installed");
      this.name = "GhNotInstalledError";
    }
  },
}));

import {
  formatReviewResult,
  runReview,
} from "../../applications/review/index.js";
import { runReviewOutput } from "./run-review-output.js";

const mockRunReview = vi.mocked(runReview);
const mockFormatReviewResult = vi.mocked(formatReviewResult);

const makeOutcome = (thresholdMet: boolean | null = null) => ({
  coverage: {} as never,
  dryRun: false,
  planned: [],
  posted: [],
  pr: { headSha: "abc", number: 1, url: "https://example.com/pr/1" },
  skippedExisting: 0,
  thresholdMet,
  updatedExisting: 0,
});

const baseArgs = {
  cwd: "/repo",
  ext: "ts,tsx",
  runner: "auto" as const,
};

describe("runReviewOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("calls runReview and logs formatted result", async () => {
    mockRunReview.mockResolvedValue(makeOutcome(true));

    await runReviewOutput(baseArgs);

    expect(mockRunReview).toHaveBeenCalledOnce();
    expect(mockFormatReviewResult).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith("=== review result ===");
  });

  it("passes base to console.error progress message", async () => {
    mockRunReview.mockResolvedValue(makeOutcome());

    await runReviewOutput({ ...baseArgs, base: "develop" });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("develop"),
    );
  });

  it("exits with 1 when thresholdMet is false", async () => {
    mockRunReview.mockResolvedValue(makeOutcome(false));

    await expect(runReviewOutput(baseArgs)).rejects.toThrow(
      "process.exit called",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("does not exit when thresholdMet is null", async () => {
    mockRunReview.mockResolvedValue(makeOutcome(null));

    await runReviewOutput(baseArgs);

    expect(process.exit).not.toHaveBeenCalled();
  });

  it("calls handleReviewError on runReview failure", async () => {
    mockRunReview.mockRejectedValue(new Error("network error"));

    await expect(runReviewOutput(baseArgs)).rejects.toThrow(
      "process.exit called",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
