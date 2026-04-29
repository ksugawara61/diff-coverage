import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { readCoverageFinal, readCoverageSummary } from "./coverage-files.js";

const mockReadFile = vi.mocked(readFile);

describe("readCoverageSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads and parses coverage-summary.json from cwd", async () => {
    const data = {
      "/project/src/foo.ts": {
        branches: { covered: 4, pct: 100, total: 4 },
        functions: { covered: 5, pct: 100, total: 5 },
        lines: { covered: 10, pct: 100, total: 10 },
        statements: { covered: 10, pct: 100, total: 10 },
      },
    };
    mockReadFile.mockResolvedValueOnce(JSON.stringify(data) as never);

    const result = await readCoverageSummary("/project");

    expect(mockReadFile).toHaveBeenCalledWith(
      "/project/coverage/coverage-summary.json",
      "utf-8",
    );
    expect(result["/project/src/foo.ts"].lines.pct).toBe(100);
  });

  it("throws when the file does not exist", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(readCoverageSummary("/project")).rejects.toThrow("ENOENT");
  });
});

describe("readCoverageFinal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads and parses coverage-final.json from cwd", async () => {
    const data = {
      "/project/src/foo.ts": {
        s: { "0": 1, "1": 0 },
        statementMap: {
          "0": { start: { line: 1 } },
          "1": { start: { line: 5 } },
        },
      },
    };
    mockReadFile.mockResolvedValueOnce(JSON.stringify(data) as never);

    const result = await readCoverageFinal("/project");

    expect(mockReadFile).toHaveBeenCalledWith(
      "/project/coverage/coverage-final.json",
      "utf-8",
    );
    expect(result["/project/src/foo.ts"]).toBeDefined();
  });

  it("throws when the file does not exist", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
    await expect(readCoverageFinal("/project")).rejects.toThrow("ENOENT");
  });
});
