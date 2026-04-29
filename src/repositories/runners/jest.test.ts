import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn().mockResolvedValue({ stderr: "", stdout: "" }),
}));

import { execa } from "execa";
import { runJest } from "./jest.js";

const mockExeca = vi.mocked(execa);

function makePaths(paths: string[]): string[] {
  return paths;
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
      options: { cwd: "/project" },
    },
    {
      expectedBin: "pnpm",
      expectedFirstArg: "jest",
      name: "with custom testCommand",
      options: { cwd: "/project", testCommand: "pnpm jest" },
    },
  ])("invokes jest $name", async ({
    options,
    expectedBin,
    expectedFirstArg,
  }) => {
    await runJest(options, makePaths(["src/foo.ts"]));

    expect(mockExeca).toHaveBeenCalledOnce();
    const [bin, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(bin).toBe(expectedBin);
    expect(args[0]).toBe(expectedFirstArg);
  });

  describe("CLI arguments", () => {
    const options = { cwd: "/project" };
    const diffFilePaths = ["src/a.ts", "src/b.ts"];

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
      await runJest(options, diffFilePaths);
      expect(getInvocationArgs()).toContain(flag);
    });
  });

  it("sets CI=true in environment", async () => {
    await runJest({ cwd: "/project" }, ["src/a.ts"]);

    const execaOptions = mockExeca.mock.calls[0].at(-1) as {
      env: Record<string, string>;
    };
    expect(execaOptions.env).toMatchObject({ CI: "true" });
  });
});
