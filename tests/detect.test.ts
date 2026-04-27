import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectRunner } from "../src/runner/detect.js";

describe("detectRunner", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "diff-coverage-detect-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects vitest from vitest.config.ts", async () => {
    await writeFile(join(tmpDir, "vitest.config.ts"), "export default {}");
    expect(await detectRunner(tmpDir)).toBe("vitest");
  });

  it("detects vitest from vitest.config.js", async () => {
    await writeFile(join(tmpDir, "vitest.config.js"), "module.exports = {}");
    expect(await detectRunner(tmpDir)).toBe("vitest");
  });

  it("detects vitest from vitest.config.mts", async () => {
    await writeFile(join(tmpDir, "vitest.config.mts"), "export default {}");
    expect(await detectRunner(tmpDir)).toBe("vitest");
  });

  it("detects vitest from vite.config.ts when it references vitest", async () => {
    await writeFile(
      join(tmpDir, "vite.config.ts"),
      "import { defineConfig } from 'vitest/config'; export default defineConfig({ test: {} })",
    );
    expect(await detectRunner(tmpDir)).toBe("vitest");
  });

  it("does not detect vitest from vite.config.ts without vitest references", async () => {
    await writeFile(
      join(tmpDir, "vite.config.ts"),
      "import { defineConfig } from 'vite'; export default defineConfig({});",
    );
    expect(await detectRunner(tmpDir)).toBe("jest");
  });

  it("detects jest from jest.config.ts", async () => {
    await writeFile(join(tmpDir, "jest.config.ts"), "export default {}");
    expect(await detectRunner(tmpDir)).toBe("jest");
  });

  it("detects jest from jest.config.js", async () => {
    await writeFile(join(tmpDir, "jest.config.js"), "module.exports = {}");
    expect(await detectRunner(tmpDir)).toBe("jest");
  });

  it("detects jest from jest.config.cjs", async () => {
    await writeFile(join(tmpDir, "jest.config.cjs"), "module.exports = {}");
    expect(await detectRunner(tmpDir)).toBe("jest");
  });

  it("prefers vitest config file over jest config file", async () => {
    await writeFile(join(tmpDir, "vitest.config.ts"), "export default {}");
    await writeFile(join(tmpDir, "jest.config.ts"), "export default {}");
    expect(await detectRunner(tmpDir)).toBe("vitest");
  });

  it("detects jest from package.json jest key", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ jest: { testEnvironment: "node" } }),
    );
    expect(await detectRunner(tmpDir)).toBe("jest");
  });

  it("detects vitest from package.json scripts containing vitest", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ scripts: { test: "vitest run" } }),
    );
    expect(await detectRunner(tmpDir)).toBe("vitest");
  });

  it("detects jest from package.json scripts containing jest", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ scripts: { test: "jest --coverage" } }),
    );
    expect(await detectRunner(tmpDir)).toBe("jest");
  });

  it("detects vitest from package.json devDependencies", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ devDependencies: { vitest: "^2.0.0" } }),
    );
    expect(await detectRunner(tmpDir)).toBe("vitest");
  });

  it("detects jest from package.json devDependencies", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ devDependencies: { jest: "^29.0.0" } }),
    );
    expect(await detectRunner(tmpDir)).toBe("jest");
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
