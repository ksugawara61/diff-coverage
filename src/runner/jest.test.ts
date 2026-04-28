import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stderr: "", stdout: "" }),
}));

import { execa } from "execa";
import type { RunOptions } from "../shared/coverage.js";
import type { DiffFile } from "../shared/diff.js";
import { runJest } from "./jest.js";

const mockExeca = vi.mocked(execa);

function makeDiffFile(path: string, additions = 1): DiffFile {
  return { addedLines: [], additions, deletions: 0, path };
}

function getInvocationArgs(): string[] {
  return mockExeca.mock.calls[0][1] as string[];
}

describe("runJest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      expectedBin: "npx",
      expectedFirstArg: "jest",
      name: "via npx by default",
      options: { cwd: "/project" } as RunOptions,
    },
    {
      expectedBin: "pnpm",
      expectedFirstArg: "jest",
      name: "with custom testCommand",
      options: {
        cwd: "/project",
        testCommand: "pnpm jest",
      } as RunOptions,
    },
  ])("invokes jest $name", async ({
    options,
    expectedBin,
    expectedFirstArg,
  }) => {
    await runJest(options, [makeDiffFile("src/foo.ts")]);

    expect(mockExeca).toHaveBeenCalledOnce();
    const [bin, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(bin).toBe(expectedBin);
    expect(args[0]).toBe(expectedFirstArg);
  });

  describe("CLI arguments", () => {
    const options: RunOptions = { cwd: "/project" };
    const diffFiles: DiffFile[] = [
      makeDiffFile("src/a.ts"),
      makeDiffFile("src/b.ts", 2),
    ];

    it.each([
      ["--coverage"],
      ["--passWithNoTests"],
      ["--findRelatedTests"],
      ["--coverageReporters=json-summary"],
      ["--coverageReporters=json"],
      ["--collectCoverageFrom=src/a.ts"],
      ["--collectCoverageFrom=src/b.ts"],
      ["src/a.ts"],
      ["src/b.ts"],
    ])("includes %s", async (flag) => {
      await runJest(options, diffFiles);
      expect(getInvocationArgs()).toContain(flag);
    });
  });

  it("sets CI=true in environment", async () => {
    await runJest({ cwd: "/project" }, [makeDiffFile("src/a.ts")]);

    const execaOptions = mockExeca.mock.calls[0].at(-1) as {
      env: Record<string, string>;
    };
    expect(execaOptions.env).toMatchObject({ CI: "true" });
  });
});
