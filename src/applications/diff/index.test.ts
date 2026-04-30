import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/exclude-patterns.js", () => ({
  mergeExcludePatterns: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../repositories/git.js", () => ({
  getDiffFiles: vi.fn(),
}));

import { type DiffFile, getDiffFiles } from "../../repositories/git.js";
import { mergeExcludePatterns } from "../shared/exclude-patterns.js";
import { formatDiffFiles, runDiffFiles } from "./index.js";

const mockMergeExcludePatterns = vi.mocked(mergeExcludePatterns);
const mockGetDiffFiles = vi.mocked(getDiffFiles);

const diffFile = (overrides: Partial<DiffFile> = {}): DiffFile => ({
  addedLines: [],
  additions: 1,
  deletions: 0,
  path: "src/foo.ts",
  repoPath: "src/foo.ts",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockMergeExcludePatterns.mockResolvedValue([]);
});

describe("runDiffFiles", () => {
  it("merges config.exclude with opts.exclude and forwards to getDiffFiles", async () => {
    mockMergeExcludePatterns.mockResolvedValueOnce([
      "regex:a.ts",
      "regex:b.ts",
    ]);
    mockGetDiffFiles.mockResolvedValueOnce([diffFile()]);

    const result = await runDiffFiles({
      base: "main",
      cwd: "/repo",
      exclude: ["b.ts"],
      extensions: ["ts"],
    });

    expect(mockGetDiffFiles).toHaveBeenCalledWith(
      "/repo",
      "main",
      ["ts"],
      undefined,
      ["regex:a.ts", "regex:b.ts"],
    );
    expect(result.files).toHaveLength(1);
  });
});

describe("formatDiffFiles", () => {
  it("returns the empty-state message when files is empty", () => {
    expect(formatDiffFiles([])).toBe("No changed source files.");
  });

  it("renders compact one-line-per-file format by default", () => {
    const out = formatDiffFiles([
      diffFile({ additions: 5, deletions: 2, path: "src/a.ts" }),
      diffFile({ additions: 1, deletions: 0, path: "src/b.ts" }),
    ]);
    expect(out).toBe("src/a.ts  (+5/-2)\nsrc/b.ts  (+1/-0)");
  });

  it("renders verbose format with addedLines preview when showAddedLines is true", () => {
    const out = formatDiffFiles(
      [
        diffFile({
          addedLines: [10, 11, 12],
          additions: 3,
          deletions: 0,
          path: "src/a.ts",
        }),
      ],
      { showAddedLines: true },
    );
    expect(out).toContain("Changed files (1):");
    expect(out).toContain("src/a.ts  (+3 additions, -0 deletions)");
    expect(out).toContain("Added lines: 10, 11, 12");
  });

  it("truncates the addedLines preview after 10 entries", () => {
    const addedLines = Array.from({ length: 12 }, (_, i) => i + 1);
    const out = formatDiffFiles(
      [diffFile({ addedLines, additions: 12, path: "src/a.ts" })],
      { showAddedLines: true },
    );
    expect(out).toContain("1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ...");
    expect(out).not.toContain(", 11");
  });

  it("omits the addedLines line when there are no added lines", () => {
    const out = formatDiffFiles(
      [diffFile({ addedLines: [], path: "src/a.ts" })],
      { showAddedLines: true },
    );
    expect(out).not.toContain("Added lines:");
  });
});
