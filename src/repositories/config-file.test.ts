import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { loadConfig } from "./config-file.js";

const mockReadFile = vi.mocked(readFile);

describe("loadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      name: "no config file exists",
      setup: () => mockReadFile.mockRejectedValueOnce(new Error("ENOENT")),
    },
    {
      name: "config file is malformed JSON",
      setup: () => mockReadFile.mockResolvedValueOnce("not json" as never),
    },
    {
      name: "exclude is not present",
      setup: () =>
        mockReadFile.mockResolvedValueOnce(JSON.stringify({}) as never),
    },
  ])("returns empty config when $name", async ({ setup }) => {
    setup();
    expect(await loadConfig("/project")).toEqual({});
  });

  it("loads exclude patterns from config file", async () => {
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ exclude: ["*.mocks.ts", "src/fixtures/**"] }) as never,
    );
    const config = await loadConfig("/project");
    expect(config.exclude).toEqual(["*.mocks.ts", "src/fixtures/**"]);
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
