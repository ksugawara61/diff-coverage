#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { formatDiffFiles, runDiffFiles } from "./commands/diff/diff.js";
import { runMeasure } from "./commands/measure/measure.js";
import { formatReviewResult, runReview } from "./commands/review/review.js";
import { detectRunner } from "./runner/detect.js";
import type { FileDetail } from "./shared/coverage.js";
import { formatResult } from "./shared/format.js";
import { RunnerEnumSchema } from "./shared/schema.js";

const server = new McpServer({
  name: "diff-coverage",
  version: "0.1.0",
});

const RunnerSchema = RunnerEnumSchema.optional()
  .default("auto")
  .describe(
    "Test runner to use. 'auto' detects from vitest.config.* / jest.config.* / package.json",
  );

// ─── Coverage detail helpers ──────────────────────────────────────────────────

const collectUncoveredStatements = (fileData: FileDetail): number[] => {
  const lines = Object.entries(fileData.s ?? {})
    .filter(([, count]) => count === 0)
    .map(([id]) => fileData.statementMap?.[id]?.start?.line)
    .filter((line): line is number => typeof line === "number");
  return [...new Set(lines)].sort((a, b) => a - b);
};

const collectUncoveredFunctions = (fileData: FileDetail): string[] =>
  Object.entries(fileData.f ?? {})
    .filter(([, count]) => count === 0)
    .map(([id]) => fileData.fnMap?.[id])
    .filter((fn): fn is NonNullable<typeof fn> => fn !== undefined)
    .map((fn) => `${fn.name} (line ${fn.loc?.start?.line})`);

const collectUncoveredBranches = (fileData: FileDetail): number[] => {
  const lines = Object.entries(fileData.b ?? {}).flatMap(([id, counts]) =>
    counts
      .map((count, i) =>
        count === 0
          ? fileData.branchMap?.[id]?.locations?.[i]?.start?.line
          : undefined,
      )
      .filter((line): line is number => typeof line === "number"),
  );
  return [...new Set(lines)].sort((a, b) => a - b);
};

// ─── Tool 1: measure_diff_coverage ───────────────────────────────────────────

server.tool(
  "measure_diff_coverage",
  "Measure test coverage (Jest or Vitest) for files changed in the current git diff. Returns per-file coverage percentages and a summary.",
  {
    base: z
      .string()
      .optional()
      .default("main")
      .describe("Base branch/ref to diff against (default: main)"),
    cwd: z
      .string()
      .describe(
        "Absolute path to the project root (where package.json and test config live)",
      ),
    exclude: z
      .array(z.string())
      .optional()
      .describe(
        "Glob patterns for files to exclude from coverage (e.g. ['*.mocks.ts', 'src/fixtures/**'])",
      ),
    extensions: z
      .array(z.string())
      .optional()
      .describe("File extensions to include (default: ts,tsx,js,jsx)"),
    runner: RunnerSchema,
    testCommand: z
      .string()
      .optional()
      .describe(
        "Override test command, e.g. 'pnpm vitest' or 'npx jest --config jest.ci.config.ts'",
      ),
    threshold: z
      .number()
      .optional()
      .describe(
        "Minimum line coverage % — result is marked as error if below this",
      ),
  },
  async ({
    cwd,
    base,
    runner,
    testCommand,
    extensions,
    exclude,
    threshold,
  }) => {
    try {
      const outcome = await runMeasure({
        base,
        cwd: resolve(cwd),
        exclude,
        extensions,
        runner,
        testCommand,
        threshold,
      });

      if (outcome.diffFiles.length === 0) {
        return {
          content: [
            {
              text: "No changed source files found in diff. Either there are no changes, or all changes are in excluded files (tests, dist, node_modules).",
              type: "text",
            },
          ],
        };
      }

      return {
        content: [
          { text: formatResult(outcome.coverage, threshold), type: "text" },
          { text: JSON.stringify(outcome.coverage, null, 2), type: "text" },
        ],
        isError: outcome.thresholdMet === false,
      };
    } catch (err) {
      return {
        content: [
          {
            text: `Error running coverage: ${err instanceof Error ? err.message : String(err)}`,
            type: "text",
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 2: get_diff_files ───────────────────────────────────────────────────

server.tool(
  "get_diff_files",
  "List source files changed in the current git diff without running tests. Useful to preview what will be measured.",
  {
    base: z
      .string()
      .optional()
      .default("main")
      .describe("Base branch to diff against"),
    cwd: z.string().describe("Absolute path to the project root"),
    exclude: z
      .array(z.string())
      .optional()
      .describe("Glob patterns for files to exclude (e.g. ['*.mocks.ts'])"),
    extensions: z.array(z.string()).optional(),
  },
  async ({ cwd, base, extensions, exclude }) => {
    try {
      const { files } = await runDiffFiles({
        base,
        cwd: resolve(cwd),
        exclude,
        extensions,
      });
      return {
        content: [
          {
            text: formatDiffFiles(files, { showAddedLines: true }),
            type: "text",
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            type: "text",
          },
        ],
        isError: true,
      };
    }
  },
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
    try {
      const coveragePath = resolve(cwd, "coverage/coverage-final.json");
      const raw = await readFile(coveragePath, "utf-8");
      const data = JSON.parse(raw) as Record<string, FileDetail>;

      const fileData = data[resolve(cwd, filePath)];

      if (!fileData) {
        return {
          content: [
            {
              text: `No coverage data found for ${filePath}. Make sure measure_diff_coverage was run first.`,
              type: "text",
            },
          ],
        };
      }

      const stmtLines = collectUncoveredStatements(fileData);
      const fnNames = collectUncoveredFunctions(fileData);
      const branchLines = collectUncoveredBranches(fileData);

      const lines = [
        `=== Uncovered Code in ${filePath} ===\n`,
        `Uncovered statements at lines: ${stmtLines.join(", ") || "none"}`,
        `Uncovered functions: ${fnNames.join(", ") || "none"}`,
        `Uncovered branch locations at lines: ${branchLines.join(", ") || "none"}`,
      ];

      return { content: [{ text: lines.join("\n"), type: "text" }] };
    } catch (err) {
      return {
        content: [
          {
            text: `Error reading coverage data: ${err instanceof Error ? err.message : String(err)}`,
            type: "text",
          },
        ],
        isError: true,
      };
    }
  },
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
        content: [{ text: `Detected test runner: ${runner}`, type: "text" }],
      };
    } catch (err) {
      return {
        content: [
          {
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            type: "text",
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Tool 5: review_pr_coverage ───────────────────────────────────────────────

server.tool(
  "review_pr_coverage",
  "Post inline GitHub review comments for diff-coverage uncovered lines on the PR associated with the current branch. Uses `gh` CLI for authentication; the GitHub CLI must be installed and `gh auth login` completed. The review event is always COMMENT.",
  {
    base: z
      .string()
      .optional()
      .default("main")
      .describe("Base branch/ref to diff against (default: main)"),
    cwd: z.string().describe("Absolute path to the project root"),
    dryRun: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, return planned comments without posting"),
    exclude: z
      .array(z.string())
      .optional()
      .describe("Glob patterns to exclude from coverage"),
    extensions: z
      .array(z.string())
      .optional()
      .describe("File extensions to include (default: ts,tsx,js,jsx)"),
    pr: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "PR number override; auto-detected from current branch if omitted",
      ),
    runner: RunnerSchema,
    threshold: z
      .number()
      .optional()
      .describe(
        "Minimum line coverage %; included in the summary body (review event is always COMMENT)",
      ),
  },
  async ({ cwd, base, runner, threshold, pr, dryRun, exclude, extensions }) => {
    try {
      const outcome = await runReview({
        base,
        cwd: resolve(cwd),
        dryRun,
        exclude,
        extensions,
        pr,
        runner,
        threshold,
      });
      return {
        content: [
          { text: formatReviewResult(outcome), type: "text" },
          { text: JSON.stringify(outcome, null, 2), type: "text" },
        ],
        isError: outcome.thresholdMet === false,
      };
    } catch (err) {
      return {
        content: [
          {
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            type: "text",
          },
        ],
        isError: true,
      };
    }
  },
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
