import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/runners/typecheck.js", () => ({
  runTsc: vi.fn(),
}));

import type { DiffFile } from "../../repositories/git.js";
import { runTsc } from "../../repositories/runners/typecheck.js";
import { runTypecheck } from "./index.js";

const mockRunTsc = vi.mocked(runTsc);

const CWD = "/project";

const makeDiffFile = (
  path: string,
  overrides?: Partial<DiffFile>,
): DiffFile => ({
  addedLines: [],
  additions: 0,
  deletions: 0,
  path,
  ...overrides,
});

describe("runTypecheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns passing result when tsc has no errors", async () => {
    mockRunTsc.mockResolvedValueOnce("");
    const result = await runTypecheck(CWD, [makeDiffFile("src/foo.ts")]);
    expect(result.passed).toBe(true);
    expect(result.totalErrors).toBe(0);
    expect(result.files[0].errors).toEqual([]);
  });

  it("parses TypeScript errors from tsc output", async () => {
    const output =
      "src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    mockRunTsc.mockResolvedValueOnce(output);
    const result = await runTypecheck(CWD, [makeDiffFile("src/foo.ts")]);
    expect(result.passed).toBe(false);
    expect(result.totalErrors).toBe(1);
    expect(result.files[0].errors[0]).toMatchObject({
      code: "TS2322",
      column: 5,
      file: "src/foo.ts",
      line: 10,
      message: "Type 'string' is not assignable to type 'number'.",
    });
  });

  it("filters errors to only files present in the diff", async () => {
    const output = [
      "src/foo.ts(10,5): error TS2322: Error in foo.",
      "src/other.ts(5,3): error TS2304: Error in other.",
    ].join("\n");
    mockRunTsc.mockResolvedValueOnce(output);
    const result = await runTypecheck(CWD, [makeDiffFile("src/foo.ts")]);
    expect(result.totalErrors).toBe(1);
    expect(result.diffFiles).toEqual(["src/foo.ts"]);
  });

  it("uses custom command when cmd is provided", async () => {
    mockRunTsc.mockResolvedValueOnce("");
    await runTypecheck(CWD, [], "pnpm tsc --noEmit");
    expect(mockRunTsc).toHaveBeenCalledWith(CWD, "pnpm tsc --noEmit");
  });

  it("distributes errors to their respective file entries", async () => {
    const output = [
      "src/a.ts(1,1): error TS2322: Error in a.",
      "src/b.ts(2,2): error TS2304: Error in b.",
    ].join("\n");
    mockRunTsc.mockResolvedValueOnce(output);
    const result = await runTypecheck(CWD, [
      makeDiffFile("src/a.ts"),
      makeDiffFile("src/b.ts"),
    ]);
    expect(result.totalErrors).toBe(2);
    expect(result.passed).toBe(false);
    expect(result.files[0].errors).toHaveLength(1);
    expect(result.files[1].errors).toHaveLength(1);
  });

  it("includes all diff file paths in result even when no errors", async () => {
    mockRunTsc.mockResolvedValueOnce("");
    const result = await runTypecheck(CWD, [
      makeDiffFile("src/a.ts"),
      makeDiffFile("src/b.ts"),
    ]);
    expect(result.diffFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.files).toHaveLength(2);
  });
});
