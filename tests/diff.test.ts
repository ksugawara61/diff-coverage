import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

import { execa } from "execa";
import { getDiffFiles } from "../core.js";

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
    mockGit(new Error("no origin"), { stdout: "" });
    const files = await getDiffFiles("/project", "main");
    expect(files).toEqual([]);
  });

  it("returns diff files with addition and deletion counts", async () => {
    mockGit(
      new Error("no origin/main"),      // git rev-parse
      { stdout: "src/foo.ts" },          // git diff --name-only
      { stdout: "5\t2\tsrc/foo.ts" },   // git diff --numstat
      { stdout: "@@ -1,2 +1,5 @@\n+a\n+b\n+c\n+d\n+e\n-x\n-y" }, // getAddedLines
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

  it("filters out test files by default", async () => {
    mockGit(
      new Error("no origin"),
      { stdout: "src/foo.ts\nsrc/foo.test.ts\nsrc/foo.spec.ts" },
      { stdout: "1\t0\tsrc/foo.ts" },
      { stdout: "" },
    );

    const files = await getDiffFiles("/project", "main");

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
  });

  it("filters out files inside a node_modules subdirectory", async () => {
    mockGit(
      new Error("no origin"),
      { stdout: "src/foo.ts\nlib/node_modules/pkg/index.ts" },
      { stdout: "1\t0\tsrc/foo.ts" },
      { stdout: "" },
    );

    const files = await getDiffFiles("/project", "main");

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
  });

  it("filters out .d.ts declaration files", async () => {
    mockGit(
      new Error("no origin"),
      { stdout: "src/foo.ts\nsrc/types.d.ts" },
      { stdout: "1\t0\tsrc/foo.ts" },
      { stdout: "" },
    );

    const files = await getDiffFiles("/project", "main");

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
  });

  it("filters files by provided extensions", async () => {
    mockGit(
      new Error("no origin"),
      { stdout: "src/foo.ts" },
      { stdout: "1\t0\tsrc/foo.ts" },
      { stdout: "" },
    );

    const files = await getDiffFiles("/project", "main", ["ts"]);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
  });

  it("uses origin/base ref when it exists", async () => {
    mockGit(
      { stdout: "abc123" },             // git rev-parse succeeds
      { stdout: "src/foo.ts" },         // git diff --name-only
      { stdout: "1\t0\tsrc/foo.ts" },   // git diff --numstat
      { stdout: "" },                   // getAddedLines
    );

    await getDiffFiles("/project", "main");

    const nameOnlyCall = mockExeca.mock.calls[1];
    expect(nameOnlyCall[1]).toContain("origin/main");
  });

  it("returns empty addedLines when git diff throws for a file", async () => {
    mockGit(
      new Error("no origin"),
      { stdout: "src/foo.ts" },
      { stdout: "1\t0\tsrc/foo.ts" },
      new Error("diff failed"),
    );

    const files = await getDiffFiles("/project", "main");

    expect(files[0].addedLines).toEqual([]);
  });

  it("handles multiple changed files", async () => {
    mockGit(
      new Error("no origin"),
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
});
