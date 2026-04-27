import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

import { execa } from "execa";
import { runJest } from "../../runner/jest.js";
import type { DiffFile, RunOptions } from "../../core.js";

const mockExeca = vi.mocked(execa);

describe("runJest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes jest with coverage flags via npx by default", async () => {
    const options: RunOptions = { cwd: "/project" };
    const diffFiles: DiffFile[] = [
      { addedLines: [1, 2], additions: 2, deletions: 0, path: "src/foo.ts" },
    ];

    await runJest(options, diffFiles);

    expect(mockExeca).toHaveBeenCalledOnce();
    const [bin, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(bin).toBe("npx");
    expect(args).toContain("jest");
    expect(args).toContain("--coverage");
    expect(args).toContain("--passWithNoTests");
    expect(args).toContain("--findRelatedTests");
  });

  it("uses custom test command when provided", async () => {
    const options: RunOptions = { cwd: "/project", testCommand: "pnpm jest" };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/bar.ts" },
    ];

    await runJest(options, diffFiles);

    const [bin, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(bin).toBe("pnpm");
    expect(args[0]).toBe("jest");
  });

  it("adds --collectCoverageFrom for each diff file", async () => {
    const options: RunOptions = { cwd: "/project" };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/a.ts" },
      { addedLines: [], additions: 2, deletions: 0, path: "src/b.ts" },
    ];

    await runJest(options, diffFiles);

    const args = mockExeca.mock.calls[0][1] as string[];
    expect(args).toContain("--collectCoverageFrom=src/a.ts");
    expect(args).toContain("--collectCoverageFrom=src/b.ts");
  });

  it("passes diff file paths as positional arguments for --findRelatedTests", async () => {
    const options: RunOptions = { cwd: "/project" };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/a.ts" },
      { addedLines: [], additions: 1, deletions: 0, path: "src/b.ts" },
    ];

    await runJest(options, diffFiles);

    const args = mockExeca.mock.calls[0][1] as string[];
    expect(args).toContain("src/a.ts");
    expect(args).toContain("src/b.ts");
  });

  it("sets CI=true in environment", async () => {
    const options: RunOptions = { cwd: "/project" };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/a.ts" },
    ];

    await runJest(options, diffFiles);

    const execaOptions = mockExeca.mock.calls[0].at(-1) as {
      env: Record<string, string>;
    };
    expect(execaOptions.env).toMatchObject({ CI: "true" });
  });

  it("uses coverage reporters json-summary and json", async () => {
    const options: RunOptions = { cwd: "/project" };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/a.ts" },
    ];

    await runJest(options, diffFiles);

    const args = mockExeca.mock.calls[0][1] as string[];
    expect(args).toContain("--coverageReporters=json-summary");
    expect(args).toContain("--coverageReporters=json");
  });
});
