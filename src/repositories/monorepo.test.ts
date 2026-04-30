import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
}));

import { access } from "node:fs/promises";
import type { DiffFile } from "./git.js";
import {
  findNearestPackageDir,
  groupDiffFilesByPackage,
  remapDiffFilePaths,
} from "./monorepo.js";

const mockAccess = vi.mocked(access);

const diffFile = (overrides: Partial<DiffFile> = {}): DiffFile => ({
  addedLines: [],
  additions: 0,
  deletions: 0,
  path: "src/foo.ts",
  repoPath: "src/foo.ts",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findNearestPackageDir", () => {
  it("returns startDir when package.json is found there", async () => {
    mockAccess.mockResolvedValueOnce(undefined);

    const result = await findNearestPackageDir("/repo/src", "/repo");

    expect(result).toBe("/repo/src");
    expect(mockAccess).toHaveBeenCalledWith("/repo/src/package.json");
  });

  it("walks up to find package.json when not in startDir", async () => {
    mockAccess
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce(undefined);

    const result = await findNearestPackageDir("/repo/src", "/repo");

    expect(result).toBe("/repo");
  });

  it("returns null when no package.json found within stopDir", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const result = await findNearestPackageDir("/repo/src", "/repo");

    expect(result).toBeNull();
  });

  it("returns null immediately when startDir is outside stopDir", async () => {
    const result = await findNearestPackageDir("/other/src", "/repo");

    expect(result).toBeNull();
    expect(mockAccess).not.toHaveBeenCalled();
  });
});

describe("groupDiffFilesByPackage", () => {
  it("groups all files under one entry when they share the same nearest package.json", async () => {
    mockAccess.mockImplementation(async (path) => {
      if (String(path) === "/repo/package.json") return;
      throw new Error("ENOENT");
    });

    const files = [
      diffFile({ path: "src/a.ts", repoPath: "src/a.ts" }),
      diffFile({ path: "src/b.ts", repoPath: "src/b.ts" }),
    ];

    const result = await groupDiffFilesByPackage("/repo", files);

    expect(result.size).toBe(1);
    expect(result.get("/repo")).toEqual(files);
  });

  it("splits files into separate entries when they have different nearest package.json", async () => {
    mockAccess.mockImplementation(async (path) => {
      const p = String(path);
      if (
        p === "/repo/packages/a/package.json" ||
        p === "/repo/packages/b/package.json"
      ) {
        return;
      }
      throw new Error("ENOENT");
    });

    const fileA = diffFile({
      path: "packages/a/src/a.ts",
      repoPath: "packages/a/src/a.ts",
    });
    const fileB = diffFile({
      path: "packages/b/src/b.ts",
      repoPath: "packages/b/src/b.ts",
    });

    const result = await groupDiffFilesByPackage("/repo", [fileA, fileB]);

    expect(result.size).toBe(2);
    expect(result.get("/repo/packages/a")).toEqual([fileA]);
    expect(result.get("/repo/packages/b")).toEqual([fileB]);
  });

  it("falls back to cwd when no package.json is found", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const files = [
      diffFile({ path: "src/a.ts", repoPath: "src/a.ts" }),
      diffFile({ path: "src/b.ts", repoPath: "src/b.ts" }),
    ];

    const result = await groupDiffFilesByPackage("/repo", files);

    expect(result.size).toBe(1);
    expect(result.get("/repo")).toEqual(files);
  });
});

describe("remapDiffFilePaths", () => {
  it.each([
    {
      expectedPath: "src/foo.ts",
      name: "remaps path one level down",
      newCwd: "/repo/packages/a",
      originalCwd: "/repo",
      path: "packages/a/src/foo.ts",
      repoPath: "packages/a/src/foo.ts",
    },
    {
      expectedPath: "lib/utils/bar.ts",
      name: "remaps path with deeper nesting",
      newCwd: "/repo/packages/b",
      originalCwd: "/repo",
      path: "packages/b/lib/utils/bar.ts",
      repoPath: "packages/b/lib/utils/bar.ts",
    },
  ])("$name", ({ path, repoPath, originalCwd, newCwd, expectedPath }) => {
    const file = diffFile({ path, repoPath });
    const [result] = remapDiffFilePaths([file], originalCwd, newCwd);

    expect(result?.path).toBe(expectedPath);
  });

  it("leaves repoPath unchanged", () => {
    const file = diffFile({
      path: "packages/a/src/foo.ts",
      repoPath: "packages/a/src/foo.ts",
    });

    const [result] = remapDiffFilePaths([file], "/repo", "/repo/packages/a");

    expect(result?.repoPath).toBe("packages/a/src/foo.ts");
  });
});
