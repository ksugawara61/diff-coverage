import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

import { execa } from "execa";
import { runVitest } from "../../runner/vitest.js";
import type { DiffFile, RunOptions } from "../../core.js";

const mockExeca = vi.mocked(execa);

describe("runVitest", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(join(tmpdir(), "diff-coverage-vitest-"));
    await mkdir(join(tmpDir, "coverage"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("invokes vitest with coverage flags via npx by default", async () => {
    const options: RunOptions = { cwd: tmpDir };
    const diffFiles: DiffFile[] = [
      { addedLines: [1, 2], additions: 2, deletions: 0, path: "src/foo.ts" },
    ];

    await runVitest(options, diffFiles);

    expect(mockExeca).toHaveBeenCalledOnce();
    const [bin, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(bin).toBe("npx");
    expect(args).toContain("vitest");
    expect(args).toContain("run");
    expect(args).toContain("--coverage");
    expect(args).toContain("--coverage.enabled=true");
    expect(args).toContain("--coverage.provider=v8");
  });

  it("uses custom test command when provided", async () => {
    const options: RunOptions = { cwd: tmpDir, testCommand: "pnpm vitest" };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/foo.ts" },
    ];

    await runVitest(options, diffFiles);

    const [bin, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(bin).toBe("pnpm");
    expect(args[0]).toBe("vitest");
  });

  it("adds --coverage.include for each diff file", async () => {
    const options: RunOptions = { cwd: tmpDir };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/a.ts" },
      { addedLines: [], additions: 2, deletions: 0, path: "src/b.ts" },
    ];

    await runVitest(options, diffFiles);

    const args = mockExeca.mock.calls[0][1] as string[];
    const includeValues = args
      .map((a, i) => (a === "--coverage.include" ? args[i + 1] : null))
      .filter(Boolean);
    expect(includeValues).toContain("src/a.ts");
    expect(includeValues).toContain("src/b.ts");
  });

  it("uses json and json-summary coverage reporters", async () => {
    const options: RunOptions = { cwd: tmpDir };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/foo.ts" },
    ];

    await runVitest(options, diffFiles);

    const args = mockExeca.mock.calls[0][1] as string[];
    expect(args).toContain("--coverage.reporter=json");
    expect(args).toContain("--coverage.reporter=json-summary");
  });

  it("sets CI=true in environment", async () => {
    const options: RunOptions = { cwd: tmpDir };
    const diffFiles: DiffFile[] = [
      { addedLines: [], additions: 1, deletions: 0, path: "src/a.ts" },
    ];

    await runVitest(options, diffFiles);

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
      total: {
        branches: { covered: 5, pct: 50, total: 10 },
        functions: { covered: 5, pct: 50, total: 10 },
        lines: { covered: 5, pct: 50, total: 10 },
        statements: { covered: 5, pct: 50, total: 10 },
      },
      "src/foo.ts": {
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
