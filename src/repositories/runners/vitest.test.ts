import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stderr: "", stdout: "" }),
}));

import { execa } from "execa";
import { detectVitestCoverageProvider, runVitest } from "./vitest.js";

const mockExeca = vi.mocked(execa);

function getInvocationArgs(): string[] {
  return mockExeca.mock.calls[0][1] as string[];
}

function extractCoverageIncludeValues(args: string[]): string[] {
  return args
    .map((a, i) => (a === "--coverage.include" ? args[i + 1] : null))
    .filter((v): v is string => v != null);
}

describe("detectVitestCoverageProvider", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "diff-coverage-provider-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  it.each([
    {
      expected: "v8",
      name: "returns 'v8' when @vitest/coverage-v8 is installed",
      setup: async (dir: string) => {
        await mkdir(join(dir, "node_modules/@vitest/coverage-v8"), {
          recursive: true,
        });
      },
    },
    {
      expected: "istanbul",
      name: "returns 'istanbul' when only @vitest/coverage-istanbul is installed",
      setup: async (dir: string) => {
        await mkdir(join(dir, "node_modules/@vitest/coverage-istanbul"), {
          recursive: true,
        });
      },
    },
    {
      expected: "v8",
      name: "prefers v8 over istanbul when both are installed",
      setup: async (dir: string) => {
        await mkdir(join(dir, "node_modules/@vitest/coverage-v8"), {
          recursive: true,
        });
        await mkdir(join(dir, "node_modules/@vitest/coverage-istanbul"), {
          recursive: true,
        });
      },
    },
    {
      expected: null,
      name: "returns null when neither provider is installed",
      setup: async (_dir: string) => {},
    },
  ])("$name", async ({ setup, expected }) => {
    await setup(tmpDir);
    expect(await detectVitestCoverageProvider(tmpDir)).toBe(expected);
  });
});

describe("runVitest", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(join(tmpdir(), "diff-coverage-vitest-"));
    await mkdir(join(tmpDir, "coverage"), { recursive: true });
    await mkdir(join(tmpDir, "node_modules/@vitest/coverage-v8"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  it.each([
    {
      expectedBin: "npx",
      expectedFirstArg: "vitest",
      makeOptions: () => ({ cwd: tmpDir }),
      name: "via npx by default",
    },
    {
      expectedBin: "pnpm",
      expectedFirstArg: "exec",
      makeOptions: () => ({
        cwd: tmpDir,
        testCommand: "pnpm exec vitest run --config .vitest/config.ts",
      }),
      name: "with custom testCommand",
    },
  ])("invokes vitest $name", async ({
    makeOptions,
    expectedBin,
    expectedFirstArg,
  }) => {
    await runVitest(makeOptions(), ["src/foo.ts"]);

    expect(mockExeca).toHaveBeenCalledOnce();
    const [bin, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(bin).toBe(expectedBin);
    expect(args[0]).toBe(expectedFirstArg);
  });

  it("does not duplicate 'run' when testCommand already contains it", async () => {
    await runVitest(
      {
        cwd: tmpDir,
        testCommand: "pnpm exec vitest run --config .vitest/config.ts",
      },
      ["src/foo.ts"],
    );
    const args = getInvocationArgs();
    expect(args.filter((a) => a === "run")).toHaveLength(1);
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
      await runVitest({ cwd: tmpDir }, ["src/foo.ts"]);
      expect(getInvocationArgs()).toContain(flag);
    });

    it("adds --coverage.include for each diff file", async () => {
      await runVitest({ cwd: tmpDir }, ["src/a.ts", "src/b.ts"]);
      const includes = extractCoverageIncludeValues(getInvocationArgs());
      expect(includes).toContain("src/a.ts");
      expect(includes).toContain("src/b.ts");
    });

    it("uses --coverage.provider=istanbul when only istanbul is installed", async () => {
      await rm(join(tmpDir, "node_modules/@vitest/coverage-v8"), {
        force: true,
        recursive: true,
      });
      await mkdir(join(tmpDir, "node_modules/@vitest/coverage-istanbul"), {
        recursive: true,
      });

      await runVitest({ cwd: tmpDir }, ["src/foo.ts"]);
      expect(getInvocationArgs()).toContain("--coverage.provider=istanbul");
    });
  });

  describe("fallback to diff-coverage's own @vitest/coverage-v8", () => {
    beforeEach(async () => {
      await rm(join(tmpDir, "node_modules"), { force: true, recursive: true });
    });

    it("uses v8 provider when project has no provider installed", async () => {
      await runVitest({ cwd: tmpDir }, ["src/foo.ts"]);
      expect(getInvocationArgs()).toContain("--coverage.provider=v8");
    });

    it("creates and removes a symlink during vitest execution", async () => {
      const symlinkPath = join(tmpDir, "node_modules/@vitest/coverage-v8");

      let symlinkExistedDuringRun = false;
      mockExeca.mockImplementationOnce(async () => {
        const { access: fsAccess } = await import("node:fs/promises");
        try {
          await fsAccess(symlinkPath);
          symlinkExistedDuringRun = true;
        } catch {
          // not found
        }
        return { stderr: "", stdout: "" } as never;
      });

      await runVitest({ cwd: tmpDir }, ["src/foo.ts"]);

      expect(symlinkExistedDuringRun).toBe(true);

      // Symlink should be cleaned up after vitest exits
      const { access: fsAccess } = await import("node:fs/promises");
      await expect(fsAccess(symlinkPath)).rejects.toThrow();
    });
  });

  it("sets CI=true in environment", async () => {
    await runVitest({ cwd: tmpDir }, ["src/a.ts"]);

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

    await runVitest({ cwd: tmpDir }, ["src/foo.ts"]);

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

    await runVitest({ cwd: tmpDir }, ["src/foo.ts"]);

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

    await runVitest({ cwd: tmpDir }, ["src/foo.ts"]);

    const normalized = JSON.parse(
      await readFile(join(tmpDir, "coverage/coverage-summary.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(normalized.total).toBeDefined();
    const nonTotalKeys = Object.keys(normalized).filter((k) => k !== "total");
    expect(nonTotalKeys[0]).toMatch(/^\//);
  });
});
