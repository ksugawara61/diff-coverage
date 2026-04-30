import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  formatMonorepoResult,
  formatResult,
} from "../../../applications/measure/format.js";
import {
  measureMonorepo,
  measureWithDiffFiles,
  resolveMeasureDiffFiles,
} from "../../../applications/measure/index.js";
import { RunnerEnumSchema } from "../../../applications/shared/runner-enum.js";
import { groupDiffFilesByPackage } from "../../../repositories/monorepo.js";

const RunnerSchema = RunnerEnumSchema.optional()
  .default("auto")
  .describe(
    "Test runner to use. 'auto' detects from vitest.config.* / jest.config.* / package.json",
  );

export const registerMeasureTool = (server: McpServer): void => {
  server.tool(
    "measure_diff_coverage",
    "Measure test coverage (Jest or Vitest) for files changed in the current git diff. Returns per-file coverage percentages and a summary.",
    {
      base: z
        .string()
        .optional()
        .describe(
          "Base branch/ref to diff against (default: merge-base of HEAD and main)",
        ),
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
        const resolvedCwd = resolve(cwd);
        const opts = {
          base,
          cwd: resolvedCwd,
          exclude,
          extensions,
          runner,
          testCommand,
          threshold,
        };

        const diffFiles = await resolveMeasureDiffFiles(opts);

        if (diffFiles.length === 0) {
          return {
            content: [
              {
                text: "No changed source files found in diff. Either there are no changes, or all changes are in excluded files (tests, dist, node_modules).",
                type: "text",
              },
            ],
          };
        }

        const packageMap = await groupDiffFilesByPackage(
          resolvedCwd,
          diffFiles,
        );

        if (packageMap.size > 1) {
          const monorepoOutcome = await measureMonorepo(opts, packageMap);
          const isError = monorepoOutcome.packages.some(
            (p) => p.outcome.thresholdMet === false,
          );
          return {
            content: [
              {
                text: formatMonorepoResult(monorepoOutcome.packages, threshold),
                type: "text",
              },
              {
                text: JSON.stringify(
                  monorepoOutcome.packages.map((p) => ({
                    coverage: p.outcome.coverage,
                    cwd: p.relCwd,
                  })),
                  null,
                  2,
                ),
                type: "text",
              },
            ],
            isError,
          };
        }

        const outcome = await measureWithDiffFiles(opts, diffFiles);
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
};
