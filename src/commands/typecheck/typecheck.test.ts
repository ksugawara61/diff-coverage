import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({ execa: vi.fn() }));

import { execa } from "execa";
import type { DiffFile } from "../../shared/diff.js";
import { runTypecheck } from "./typecheck.js";

const mockExeca = vi.mocked(execa);

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
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout: "" } as never);
    const result = await runTypecheck(CWD, [makeDiffFile("src/foo.ts")]);
    expect(result.passed).toBe(true);
    expect(result.totalErrors).toBe(0);
    expect(result.files[0].errors).toEqual([]);
  });

  it("parses TypeScript errors from tsc stdout", async () => {
    const stdout =
      "src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout } as never);
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

  it("parses TypeScript errors from tsc stderr", async () => {
    const stderr = "src/foo.ts(3,1): error TS2304: Cannot find name 'x'.";
    mockExeca.mockResolvedValueOnce({ stderr, stdout: "" } as never);
    const result = await runTypecheck(CWD, [makeDiffFile("src/foo.ts")]);
    expect(result.totalErrors).toBe(1);
  });

  it("filters errors to only files present in the diff", async () => {
    const stdout = [
      "src/foo.ts(10,5): error TS2322: Error in foo.",
      "src/other.ts(5,3): error TS2304: Error in other.",
    ].join("\n");
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout } as never);
    const result = await runTypecheck(CWD, [makeDiffFile("src/foo.ts")]);
    expect(result.totalErrors).toBe(1);
    expect(result.diffFiles).toEqual(["src/foo.ts"]);
  });

  it("uses custom command when cmd is provided", async () => {
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout: "" } as never);
    await runTypecheck(CWD, [], "pnpm tsc --noEmit");
    expect(mockExeca).toHaveBeenCalledWith(
      "pnpm",
      ["tsc", "--noEmit"],
      expect.objectContaining({ cwd: CWD }),
    );
  });

  it("distributes errors to their respective file entries", async () => {
    const stdout = [
      "src/a.ts(1,1): error TS2322: Error in a.",
      "src/b.ts(2,2): error TS2304: Error in b.",
    ].join("\n");
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout } as never);
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
    mockExeca.mockResolvedValueOnce({ stderr: "", stdout: "" } as never);
    const result = await runTypecheck(CWD, [
      makeDiffFile("src/a.ts"),
      makeDiffFile("src/b.ts"),
    ]);
    expect(result.diffFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.files).toHaveLength(2);
  });
});
