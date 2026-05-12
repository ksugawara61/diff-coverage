import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../applications/review/index.js", () => ({
  NoPullRequestError: class NoPullRequestError extends Error {
    code = "NO_PR" as const;
    constructor(branch: string) {
      super(`No open pull request found for branch "${branch}".`);
      this.name = "NoPullRequestError";
    }
  },
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

import { NoPullRequestError } from "../../applications/review/index.js";
import {
  GhNotAuthenticatedError,
  GhNotInstalledError,
} from "../../repositories/github.js";
import { handleReviewError } from "./handle-review-error.js";

describe("handleReviewError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    {
      error: () => new GhNotInstalledError(),
      expectedCode: 1,
      name: "GhNotInstalledError",
    },
    {
      error: () => new GhNotAuthenticatedError(),
      expectedCode: 1,
      name: "GhNotAuthenticatedError",
    },
    {
      error: () => new NoPullRequestError("feat/my-branch"),
      expectedCode: 2,
      name: "NoPullRequestError",
    },
    {
      error: () => new Error("unexpected failure"),
      expectedCode: 1,
      name: "unknown Error",
    },
  ])("calls process.exit($expectedCode) for $name", ({
    error,
    expectedCode,
  }) => {
    expect(() => handleReviewError(error())).toThrow("process.exit called");
    expect(process.exit).toHaveBeenCalledWith(expectedCode);
  });
});
