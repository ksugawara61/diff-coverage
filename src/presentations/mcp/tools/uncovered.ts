import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type FileDetail,
  readCoverageFinal,
} from "../../../repositories/coverage-files.js";

export const collectUncoveredStatements = (fileData: FileDetail): number[] => {
  const lines = Object.entries(fileData.s ?? {})
    .filter(([, count]) => count === 0)
    .map(([id]) => fileData.statementMap?.[id]?.start?.line)
    .filter((line): line is number => typeof line === "number");
  return [...new Set(lines)].sort((a, b) => a - b);
};

export const collectUncoveredFunctions = (fileData: FileDetail): string[] =>
  Object.entries(fileData.f ?? {})
    .filter(([, count]) => count === 0)
    .map(([id]) => fileData.fnMap?.[id])
    .filter((fn): fn is NonNullable<typeof fn> => fn !== undefined)
    .map((fn) => `${fn.name} (line ${fn.loc?.start?.line})`);

export const collectUncoveredBranches = (fileData: FileDetail): number[] => {
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

export const registerUncoveredTool = (server: McpServer): void => {
  server.tool(
    "get_uncovered_lines",
    "After running measure_diff_coverage, get detailed uncovered line information for a specific file to guide test writing.",
    {
      cwd: z.string().describe("Absolute path to the project root"),
      filePath: z.string().describe("Relative path to the file (from cwd)"),
    },
    async ({ cwd, filePath }) => {
      try {
        const data = await readCoverageFinal(resolve(cwd));
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
};
