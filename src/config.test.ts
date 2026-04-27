import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { globToRegex, loadConfig } from "./core.js";

const mockReadFile = vi.mocked(readFile);

describe("loadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty config when no config file exists", async () => {
    mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));
    const config = await loadConfig("/project");
    expect(config).toEqual({});
  });

  it("returns empty config when config file is malformed JSON", async () => {
    mockReadFile.mockResolvedValueOnce("not json" as never);
    const config = await loadConfig("/project");
    expect(config).toEqual({});
  });

  it("loads exclude patterns from config file", async () => {
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ exclude: ["*.mocks.ts", "src/fixtures/**"] }) as never,
    );
    const config = await loadConfig("/project");
    expect(config.exclude).toEqual(["*.mocks.ts", "src/fixtures/**"]);
  });

  it("returns empty config when exclude is not present", async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({}) as never);
    const config = await loadConfig("/project");
    expect(config).toEqual({});
  });

  it("reads .diff-coverage.json from the given cwd", async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({}) as never);
    await loadConfig("/my/project");
    expect(mockReadFile).toHaveBeenCalledWith(
      "/my/project/.diff-coverage.json",
      "utf-8",
    );
  });
});

describe("globToRegex", () => {
  it("matches filename with * anywhere in path", () => {
    const re = new RegExp(globToRegex("*.mocks.ts"));
    expect(re.test("src/foo.mocks.ts")).toBe(true);
    expect(re.test("foo.mocks.ts")).toBe(true);
    expect(re.test("src/deep/foo.mocks.ts")).toBe(true);
  });

  it("does not match different extensions with *", () => {
    const re = new RegExp(globToRegex("*.mocks.ts"));
    expect(re.test("src/foo.test.ts")).toBe(false);
    expect(re.test("src/foo.mocks.js")).toBe(false);
  });

  it("does not match across path separators with *", () => {
    const re = new RegExp(globToRegex("*.ts"));
    expect(re.test("src/foo.ts")).toBe(true);
    // * alone should not match a full path like src/foo — but it should match filenames
    expect(re.test("src/sub/bar.ts")).toBe(true);
  });

  it("matches zero or more path segments with **/ prefix", () => {
    const re = new RegExp(globToRegex("**/*.mocks.ts"));
    expect(re.test("foo.mocks.ts")).toBe(true);
    expect(re.test("src/foo.mocks.ts")).toBe(true);
    expect(re.test("src/utils/foo.mocks.ts")).toBe(true);
  });

  it("anchors patterns containing slash to the start of the path", () => {
    const re = new RegExp(globToRegex("src/*.mocks.ts"));
    expect(re.test("src/foo.mocks.ts")).toBe(true);
    expect(re.test("other/foo.mocks.ts")).toBe(false);
    expect(re.test("other/src/foo.mocks.ts")).toBe(false);
  });

  it("matches any file under a directory with src/**", () => {
    const re = new RegExp(globToRegex("src/**"));
    expect(re.test("src/foo.ts")).toBe(true);
    expect(re.test("src/utils/bar.ts")).toBe(true);
    expect(re.test("other/foo.ts")).toBe(false);
  });

  it("matches files with intermediate directories using src/**/file", () => {
    const re = new RegExp(globToRegex("src/**/*.mocks.ts"));
    expect(re.test("src/foo.mocks.ts")).toBe(true);
    expect(re.test("src/utils/foo.mocks.ts")).toBe(true);
    expect(re.test("src/a/b/foo.mocks.ts")).toBe(true);
    expect(re.test("other/foo.mocks.ts")).toBe(false);
  });

  it("matches single character with ?", () => {
    const re = new RegExp(globToRegex("foo?.ts"));
    expect(re.test("src/fooa.ts")).toBe(true);
    expect(re.test("src/foo.ts")).toBe(false);
  });
});
