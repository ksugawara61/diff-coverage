import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  formatDiffFiles,
  runDiffFiles,
} from "../../../applications/diff/index.js";

export const registerDiffTool = (server: McpServer): void => {
  server.tool(
    "get_diff_files",
    "List source files changed in the current git diff without running tests. Useful to preview what will be measured.",
    {
      base: z
        .string()
        .optional()
        .describe(
          "Base branch to diff against (default: merge-base of HEAD and main)",
        ),
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
};
