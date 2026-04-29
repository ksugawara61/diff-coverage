import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/config-file.js", () => ({
  loadConfig: vi.fn(),
}));
vi.mock("./glob.js", () => ({
  globToRegex: vi.fn((g: string) => `regex:${g}`),
}));

import { loadConfig } from "../../repositories/config-file.js";
import { mergeExcludePatterns } from "./exclude-patterns.js";

const mockLoadConfig = vi.mocked(loadConfig);

describe("mergeExcludePatterns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockResolvedValue({});
  });

  it("returns empty array when no config exclude and no extras", async () => {
    const result = await mergeExcludePatterns("/project", undefined);
    expect(result).toEqual([]);
  });

  it("merges config.exclude and extras, converting each to regex", async () => {
    mockLoadConfig.mockResolvedValueOnce({ exclude: ["*.mocks.ts"] });
    const result = await mergeExcludePatterns("/project", ["src/fixtures/**"]);
    expect(result).toEqual(["regex:*.mocks.ts", "regex:src/fixtures/**"]);
  });

  it("handles missing config.exclude gracefully", async () => {
    mockLoadConfig.mockResolvedValueOnce({});
    const result = await mergeExcludePatterns("/project", ["*.test.ts"]);
    expect(result).toEqual(["regex:*.test.ts"]);
  });
});
