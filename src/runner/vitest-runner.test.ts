import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stderr: "", stdout: "" }),
}));

import { execa } from "execa";
import type { DiffFile, RunOptions } from "../core.js";
import { runVitest } from "./vitest.js";

const mockExeca = vi.mocked(execa);

function makeDiffFile(path: string, additions = 1): DiffFile {
  return { addedLines: [], additions, deletions: 0, path };
}

function getInvocationArgs(): string[] {
  return mockExeca.mock.calls[0][1] as string[];
}

function extractCoverageIncludeValues(args: string[]): string[] {
  return args
    .map((a, i) => (a === "--coverage.include" ? args[i + 1] : null))
    .filter((v): v is string => v != null);
}

describe("runVitest", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(join(tmpdir(), "diff-coverage-vitest-"));
    await mkdir(join(tmpDir, "coverage"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  it.each([
    {
      expectedBin: "npx",
      expectedFirstArg: "vitest",
      makeOptions: (): RunOptions => ({ cwd: tmpDir }),
      name: "via npx by default",
    },
    {
      expectedBin: "pnpm",
      expectedFirstArg: "vitest",
      makeOptions: (): RunOptions => ({
        cwd: tmpDir,
        testCommand: "pnpm vitest",
      }),
      name: "with custom testCommand",
    },
  ])("invokes vitest $name", async ({
    makeOptions,
    expectedBin,
    expectedFirstArg,
  }) => {
    await runVitest(makeOptions(), [makeDiffFile("src/foo.ts")]);

    expect(mockExeca).toHaveBeenCalledOnce();
    const [bin, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(bin).toBe(expectedBin);
    expect(args[0]).toBe(expectedFirstArg);
  });

  describe("CLI arguments", () => {
    it.each([
      ["run"],
      ["--coverage"],
      ["--coverage.enabled=true"],
      ["--coverage.provider=v8"],
      ["--coverage.reporter=json"],
      ["--coverage.reporter=json-summary"],
    ])("includes %s", async (flag) => {
      await runVitest({ cwd: tmpDir }, [makeDiffFile("src/foo.ts")]);
      expect(getInvocationArgs()).toContain(flag);
    });

    it("adds --coverage.include for each diff file", async () => {
      await runVitest({ cwd: tmpDir }, [
        makeDiffFile("src/a.ts"),
        makeDiffFile("src/b.ts", 2),
      ]);
      const includes = extractCoverageIncludeValues(getInvocationArgs());
      expect(includes).toContain("src/a.ts");
      expect(includes).toContain("src/b.ts");
    });
  });

  it("sets CI=true in environment", async () => {
    await runVitest({ cwd: tmpDir }, [makeDiffFile("src/a.ts")]);

    const execaOptions = mockExeca.mock.calls[0].at(-1) as {
      env: Record<string, string>;
    };
    expect(execaOptions.env).toMatchObject({ CI: "true" });
  });

  it("normalizes relative paths to absolute paths in coverage-final.json", async () => {
    const coverageData = {
      "src/foo.ts": {
        s: { "0": 1, "1": 0 },
        statementMap: {
          "0": { start: { line: 1 } },
          "1": { start: { line: 5 } },
        },
      },
    };
    await writeFile(
      join(tmpDir, "coverage/coverage-final.json"),
      JSON.stringify(coverageData),
    );

    const options: RunOptions = { cwd: tmpDir };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/foo.ts" },
    ];

    await runVitest(options, diffFiles);

    const normalized = JSON.parse(
      await readFile(join(tmpDir, "coverage/coverage-final.json"), "utf-8"),
    ) as Record<string, unknown>;
    const keys = Object.keys(normalized);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^\//);
    expect(keys[0]).toContain("src/foo.ts");
  });

  it("preserves absolute paths in coverage-final.json unchanged", async () => {
    const absKey = join(tmpDir, "src/foo.ts");
    const coverageData = {
      [absKey]: {
        s: { "0": 1 },
        statementMap: { "0": { start: { line: 1 } } },
      },
    };
    await writeFile(
      join(tmpDir, "coverage/coverage-final.json"),
      JSON.stringify(coverageData),
    );

    const options: RunOptions = { cwd: tmpDir };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/foo.ts" },
    ];

    await runVitest(options, diffFiles);

    const normalized = JSON.parse(
      await readFile(join(tmpDir, "coverage/coverage-final.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(Object.keys(normalized)).toContain(absKey);
  });

  it("preserves 'total' key in coverage-summary.json", async () => {
    const summaryData = {
      "src/foo.ts": {
        branches: { covered: 5, pct: 50, total: 10 },
        functions: { covered: 5, pct: 50, total: 10 },
        lines: { covered: 5, pct: 50, total: 10 },
        statements: { covered: 5, pct: 50, total: 10 },
      },
      total: {
        branches: { covered: 5, pct: 50, total: 10 },
        functions: { covered: 5, pct: 50, total: 10 },
        lines: { covered: 5, pct: 50, total: 10 },
        statements: { covered: 5, pct: 50, total: 10 },
      },
    };
    await writeFile(
      join(tmpDir, "coverage/coverage-summary.json"),
      JSON.stringify(summaryData),
    );

    const options: RunOptions = { cwd: tmpDir };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/foo.ts" },
    ];

    await runVitest(options, diffFiles);

    const normalized = JSON.parse(
      await readFile(join(tmpDir, "coverage/coverage-summary.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(normalized.total).toBeDefined();
    const nonTotalKeys = Object.keys(normalized).filter((k) => k !== "total");
    expect(nonTotalKeys[0]).toMatch(/^\//);
  });
});
