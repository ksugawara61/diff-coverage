import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import { execa } from "execa";
import {
  getCurrentBranch,
  getDiffFiles,
  getMergeBase,
  getRemoteOriginUrl,
} from "./git.js";

const mockExeca = vi.mocked(execa);

function mockGit(...returns: Array<{ stdout: string } | Error>) {
  let call = mockExeca;
  for (const ret of returns) {
    if (ret instanceof Error) {
      call = call.mockRejectedValueOnce(ret) as typeof mockExeca;
    } else {
      call = call.mockResolvedValueOnce(ret as never) as typeof mockExeca;
    }
  }
}

describe("getDiffFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when git diff reports no changed files", async () => {
    mockGit(new Error("no origin"), { stdout: "/project" }, { stdout: "" });
    const files = await getDiffFiles("/project", "main");
    expect(files).toEqual([]);
  });

  it("returns diff files with addition and deletion counts", async () => {
    mockGit(
      new Error("no origin/main"),
      { stdout: "/project" },
      { stdout: "src/foo.ts" },
      { stdout: "5\t2\tsrc/foo.ts" },
      { stdout: "@@ -1,2 +1,5 @@\n+a\n+b\n+c\n+d\n+e\n-x\n-y" },
    );

    const files = await getDiffFiles("/project", "main");

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
    expect(files[0].additions).toBe(5);
    expect(files[0].deletions).toBe(2);
  });

  it("extracts added line numbers from unified diff", async () => {
    mockGit(
      new Error("no origin/main"),
      { stdout: "/project" },
      { stdout: "src/foo.ts" },
      { stdout: "3\t0\tsrc/foo.ts" },
      { stdout: "@@ -0,0 +1,3 @@\n+line1\n+line2\n+line3" },
    );

    const files = await getDiffFiles("/project", "main");

    expect(files[0].addedLines).toEqual([1, 2, 3]);
  });

  it("handles hunk starting at a non-zero line", async () => {
    mockGit(
      new Error("no origin/main"),
      { stdout: "/project" },
      { stdout: "src/foo.ts" },
      { stdout: "2\t2\tsrc/foo.ts" },
      { stdout: "@@ -10,2 +10,2 @@\n-old1\n+new1\n-old2\n+new2" },
    );

    const files = await getDiffFiles("/project", "main");

    expect(files[0].addedLines).toEqual([10, 11]);
  });

  it("handles multiple hunks in a single file", async () => {
    mockGit(
      new Error("no origin/main"),
      { stdout: "/project" },
      { stdout: "src/foo.ts" },
      { stdout: "2\t0\tsrc/foo.ts" },
      {
        stdout: [
          "@@ -1,1 +1,2 @@",
          " unchanged",
          "+added1",
          "@@ -20,0 +21,1 @@",
          "+added2",
        ].join("\n"),
      },
    );

    const files = await getDiffFiles("/project", "main");

    expect(files[0].addedLines).toContain(2);
    expect(files[0].addedLines).toContain(21);
  });

  it.each([
    {
      changedFiles: "src/foo.ts\nsrc/foo.test.ts\nsrc/foo.spec.ts",
      extensions: undefined,
      extraExcludePatterns: undefined,
      name: "test files (.test.ts / .spec.ts) by default",
    },
    {
      changedFiles: "src/foo.ts\nlib/node_modules/pkg/index.ts",
      extensions: undefined,
      extraExcludePatterns: undefined,
      name: "files inside a node_modules subdirectory",
    },
    {
      changedFiles: "src/foo.ts\nsrc/types.d.ts",
      extensions: undefined,
      extraExcludePatterns: undefined,
      name: ".d.ts declaration files",
    },
    {
      changedFiles: "src/foo.ts",
      extensions: ["ts"] as string[],
      extraExcludePatterns: undefined,
      name: "files not matching the provided extension allow-list",
    },
    {
      changedFiles: "src/foo.ts\nsrc/foo.mocks.ts",
      extensions: undefined,
      extraExcludePatterns: ["(^|/)foo\\.mocks\\.ts$"] as string[],
      name: "files matching a regex exclude pattern",
    },
  ])("filters out $name and keeps src/foo.ts", async ({
    changedFiles,
    extensions,
    extraExcludePatterns,
  }) => {
    mockGit(
      new Error("no origin"),
      { stdout: "/project" },
      { stdout: changedFiles },
      { stdout: "1\t0\tsrc/foo.ts" },
      { stdout: "" },
    );

    const files = await getDiffFiles(
      "/project",
      "main",
      extensions,
      undefined,
      extraExcludePatterns,
    );

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
  });

  it("uses origin/base ref when it exists", async () => {
    mockGit(
      { stdout: "abc123" },
      { stdout: "/project" },
      { stdout: "src/foo.ts" },
      { stdout: "1\t0\tsrc/foo.ts" },
      { stdout: "" },
    );

    await getDiffFiles("/project", "main");

    const nameOnlyCall = mockExeca.mock.calls[2];
    expect(nameOnlyCall[1]).toContain("origin/main");
  });

  it("returns empty addedLines when git diff throws for a file", async () => {
    mockGit(
      new Error("no origin"),
      { stdout: "/project" },
      { stdout: "src/foo.ts" },
      { stdout: "1\t0\tsrc/foo.ts" },
      new Error("diff failed"),
    );

    const files = await getDiffFiles("/project", "main");

    expect(files[0].addedLines).toEqual([]);
  });

  it("sets repoPath to git-root-relative path and path to cwd-relative when cwd is a subdirectory", async () => {
    mockGit(
      new Error("no origin"),
      { stdout: "/project" },
      { stdout: "sub/src/foo.ts" },
      { stdout: "2\t0\tsub/src/foo.ts" },
      { stdout: "@@ -0,0 +1,2 @@\n+line1\n+line2" },
    );

    const files = await getDiffFiles("/project/sub", "main");

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
    expect(files[0].repoPath).toBe("sub/src/foo.ts");
    expect(files[0].addedLines).toEqual([1, 2]);
  });

  it("handles multiple changed files", async () => {
    mockGit(
      new Error("no origin"),
      { stdout: "/project" },
      { stdout: "src/a.ts\nsrc/b.ts" },
      { stdout: "3\t0\tsrc/a.ts\n2\t1\tsrc/b.ts" },
      { stdout: "@@ -0,0 +1,3 @@\n+a\n+b\n+c" },
      { stdout: "@@ -5,1 +5,2 @@\n-old\n+new1\n+new2" },
    );

    const files = await getDiffFiles("/project", "main");

    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("src/a.ts");
    expect(files[0].additions).toBe(3);
    expect(files[1].path).toBe("src/b.ts");
    expect(files[1].additions).toBe(2);
    expect(files[1].deletions).toBe(1);
  });

  it("calls git merge-base when base is omitted and uses the hash as baseRef", async () => {
    mockGit(
      { stdout: "abc1234\n" },
      { stdout: "/project" },
      { stdout: "src/foo.ts" },
      { stdout: "1\t0\tsrc/foo.ts" },
      { stdout: "" },
    );

    const files = await getDiffFiles("/project");

    expect(files).toHaveLength(1);
    const mergeBaseCall = mockExeca.mock.calls[0];
    expect(mergeBaseCall[1]).toEqual(["merge-base", "HEAD", "main"]);
    const nameOnlyCall = mockExeca.mock.calls[2];
    expect(nameOnlyCall[1]).toContain("abc1234");
  });
});

describe("getMergeBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the trimmed merge-base commit hash", async () => {
    mockExeca.mockResolvedValueOnce({ stdout: "deadbeef1234\n" } as never);
    const hash = await getMergeBase("/project");
    expect(hash).toBe("deadbeef1234");
    expect(mockExeca).toHaveBeenCalledWith(
      "git",
      ["merge-base", "HEAD", "main"],
      {
        cwd: "/project",
      },
    );
  });
});

describe("getCurrentBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the current branch name", async () => {
    mockExeca.mockResolvedValueOnce({ stdout: "feature/my-branch\n" } as never);
    const branch = await getCurrentBranch("/project");
    expect(branch).toBe("feature/my-branch");
  });
});

describe("getRemoteOriginUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the remote origin URL", async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: "git@github.com:owner/repo.git\n",
    } as never);
    const url = await getRemoteOriginUrl("/project");
    expect(url).toBe("git@github.com:owner/repo.git");
  });
});
