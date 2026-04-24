#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getDiffFiles, runCoverage, formatResult } from "./core.js";
import { detectRunner } from "./runner/detect.js";
import { resolve } from "node:path";

const server = new McpServer({
  name: "diff-coverage",
  version: "0.1.0",
});

const RunnerSchema = z
  .enum(["jest", "vitest", "auto"])
  .optional()
  .default("auto")
  .describe("Test runner to use. 'auto' detects from vitest.config.* / jest.config.* / package.json");

// ─── Tool 1: measure_diff_coverage ───────────────────────────────────────────

server.tool(
  "measure_diff_coverage",
  "Measure test coverage (Jest or Vitest) for files changed in the current git diff. Returns per-file coverage percentages and a summary.",
  {
    cwd: z
      .string()
      .describe("Absolute path to the project root (where package.json and test config live)"),
    base: z
      .string()
      .optional()
      .default("main")
      .describe("Base branch/ref to diff against (default: main)"),
    runner: RunnerSchema,
    testCommand: z
      .string()
      .optional()
      .describe("Override test command, e.g. 'pnpm vitest' or 'npx jest --config jest.ci.config.ts'"),
    extensions: z
      .array(z.string())
      .optional()
      .describe("File extensions to include (default: ts,tsx,js,jsx)"),
    threshold: z
      .number()
      .optional()
      .describe("Minimum line coverage % — result is marked as error if below this"),
  },
  async ({ cwd, base, runner, testCommand, extensions, threshold }) => {
    const absPath = resolve(cwd);

    try {
      const diffFiles = await getDiffFiles(absPath, base, extensions);

      if (diffFiles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No changed source files found in diff. Either there are no changes, or all changes are in excluded files (tests, dist, node_modules).",
            },
          ],
        };
      }

      const result = await runCoverage(
        { cwd: absPath, base, runner, testCommand, extensions },
        diffFiles
      );

      const formatted = formatResult(result, threshold);
      const passed = threshold === undefined || result.summary.lines.pct >= threshold;

      return {
        content: [
          { type: "text", text: formatted },
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
        isError: !passed,
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error running coverage: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool 2: get_diff_files ───────────────────────────────────────────────────

server.tool(
  "get_diff_files",
  "List source files changed in the current git diff without running tests. Useful to preview what will be measured.",
  {
    cwd: z.string().describe("Absolute path to the project root"),
    base: z.string().optional().default("main").describe("Base branch to diff against"),
    extensions: z.array(z.string()).optional(),
  },
  async ({ cwd, base, extensions }) => {
    try {
      const files = await getDiffFiles(resolve(cwd), base, extensions);

      if (files.length === 0) {
        return { content: [{ type: "text", text: "No changed source files found." }] };
      }

      const lines = files.map(
        (f) =>
          `${f.path}  (+${f.additions} additions, -${f.deletions} deletions)` +
          (f.addedLines.length > 0
            ? `\n  Added lines: ${f.addedLines.slice(0, 10).join(", ")}${f.addedLines.length > 10 ? " ..." : ""}`
            : "")
      );

      return {
        content: [
          { type: "text", text: `Changed files (${files.length}):\n\n${lines.join("\n\n")}` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool 3: get_uncovered_lines ──────────────────────────────────────────────

server.tool(
  "get_uncovered_lines",
  "After running measure_diff_coverage, get detailed uncovered line information for a specific file to guide test writing.",
  {
    cwd: z.string().describe("Absolute path to the project root"),
    filePath: z.string().describe("Relative path to the file (from cwd)"),
  },
  async ({ cwd, filePath }) => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");

    try {
      const coveragePath = resolve(cwd, "coverage/coverage-final.json");
      const raw = await readFile(coveragePath, "utf-8");
      const data = JSON.parse(raw);

      const absFilePath = resolve(cwd, filePath);
      const fileData = data[absFilePath];

      if (!fileData) {
        return {
          content: [
            {
              type: "text",
              text: `No coverage data found for ${filePath}. Make sure measure_diff_coverage was run first.`,
            },
          ],
        };
      }

      const uncoveredStatements: number[] = [];
      const uncoveredFunctions: string[] = [];
      const uncoveredBranches: number[] = [];

      for (const [id, count] of Object.entries(fileData.s ?? {})) {
        if ((count as number) === 0) {
          const loc = fileData.statementMap?.[id]?.start?.line;
          if (loc) uncoveredStatements.push(loc);
        }
      }

      for (const [id, count] of Object.entries(fileData.f ?? {})) {
        if ((count as number) === 0) {
          const fn = fileData.fnMap?.[id];
          if (fn) uncoveredFunctions.push(`${fn.name} (line ${fn.loc?.start?.line})`);
        }
      }

      for (const [id, counts] of Object.entries(fileData.b ?? {})) {
        const arr = counts as number[];
        arr.forEach((count, i) => {
          if (count === 0) {
            const loc = fileData.branchMap?.[id]?.locations?.[i]?.start?.line;
            if (loc) uncoveredBranches.push(loc);
          }
        });
      }

      const lines = [
        `=== Uncovered Code in ${filePath} ===\n`,
        `Uncovered statements at lines: ${[...new Set(uncoveredStatements)].sort((a, b) => a - b).join(", ") || "none"}`,
        `Uncovered functions: ${uncoveredFunctions.join(", ") || "none"}`,
        `Uncovered branch locations at lines: ${[...new Set(uncoveredBranches)].sort((a, b) => a - b).join(", ") || "none"}`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return {
        content: [
          { type: "text", text: `Error reading coverage data: ${err instanceof Error ? err.message : String(err)}` },
        ],
        isError: true,
      };
    }
  }
);

// ─── Tool 4: detect_runner ────────────────────────────────────────────────────

server.tool(
  "detect_runner",
  "Detect which test runner (jest or vitest) is configured in the project, based on config files and package.json.",
  {
    cwd: z.string().describe("Absolute path to the project root"),
  },
  async ({ cwd }) => {
    try {
      const runner = await detectRunner(resolve(cwd));
      return {
        content: [{ type: "text", text: `Detected test runner: ${runner}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
