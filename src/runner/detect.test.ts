import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectRunner } from "./detect.js";

describe("detectRunner", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "diff-coverage-detect-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  it.each([
    { content: "export default {}", filename: "vitest.config.ts" },
    { content: "module.exports = {}", filename: "vitest.config.js" },
    { content: "export default {}", filename: "vitest.config.mts" },
  ])("detects vitest from $filename", async ({ filename, content }) => {
    await writeFile(join(tmpDir, filename), content);
    expect(await detectRunner(tmpDir)).toBe("vitest");
  });

  it.each([
    { content: "export default {}", filename: "jest.config.ts" },
    { content: "module.exports = {}", filename: "jest.config.js" },
    { content: "module.exports = {}", filename: "jest.config.cjs" },
  ])("detects jest from $filename", async ({ filename, content }) => {
    await writeFile(join(tmpDir, filename), content);
    expect(await detectRunner(tmpDir)).toBe("jest");
  });

  it.each([
    {
      content:
        "import { defineConfig } from 'vitest/config'; export default defineConfig({ test: {} })",
      expected: "vitest" as const,
      name: "references vitest/config",
    },
    {
      content:
        "import { defineConfig } from 'vite'; export default defineConfig({});",
      expected: "jest" as const,
      name: "references plain vite",
    },
  ])("detects $expected from vite.config.ts when it $name", async ({
    content,
    expected,
  }) => {
    await writeFile(join(tmpDir, "vite.config.ts"), content);
    expect(await detectRunner(tmpDir)).toBe(expected);
  });

  it.each([
    {
      expected: "jest" as const,
      name: "package.json with jest key",
      pkg: { jest: { testEnvironment: "node" } },
    },
    {
      expected: "vitest" as const,
      name: "package.json scripts containing vitest",
      pkg: { scripts: { test: "vitest run" } },
    },
    {
      expected: "jest" as const,
      name: "package.json scripts containing jest",
      pkg: { scripts: { test: "jest --coverage" } },
    },
    {
      expected: "vitest" as const,
      name: "package.json devDependencies vitest",
      pkg: { devDependencies: { vitest: "^2.0.0" } },
    },
    {
      expected: "jest" as const,
      name: "package.json devDependencies jest",
      pkg: { devDependencies: { jest: "^29.0.0" } },
    },
  ])("detects $expected from $name", async ({ pkg, expected }) => {
    await writeFile(join(tmpDir, "package.json"), JSON.stringify(pkg));
    expect(await detectRunner(tmpDir)).toBe(expected);
  });

  it("prefers vitest config file over jest config file", async () => {
    await writeFile(join(tmpDir, "vitest.config.ts"), "export default {}");
    await writeFile(join(tmpDir, "jest.config.ts"), "export default {}");
    expect(await detectRunner(tmpDir)).toBe("vitest");
  });

  it("falls back to jest when no config files and no package.json", async () => {
    expect(await detectRunner(tmpDir)).toBe("jest");
  });

  it("falls back to jest when package.json has no test-related keys", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ name: "my-app", scripts: { build: "tsc" } }),
    );
    expect(await detectRunner(tmpDir)).toBe("jest");
  });

  it("prefers jest config over package.json vitest script when jest.config.ts exists", async () => {
    await writeFile(join(tmpDir, "jest.config.ts"), "export default {}");
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" } }),
    );
    expect(await detectRunner(tmpDir)).toBe("jest");
  });
});
