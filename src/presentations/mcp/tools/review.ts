import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  formatReviewResult,
  runReview,
} from "../../../applications/review/index.js";
import { RunnerEnumSchema } from "../../../applications/shared/runner-enum.js";

const RunnerSchema = RunnerEnumSchema.optional()
  .default("auto")
  .describe(
    "Test runner to use. 'auto' detects from vitest.config.* / jest.config.* / package.json",
  );

export const registerReviewTool = (server: McpServer): void => {
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
    async ({
      cwd,
      base,
      runner,
      threshold,
      pr,
      dryRun,
      exclude,
      extensions,
    }) => {
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
};
