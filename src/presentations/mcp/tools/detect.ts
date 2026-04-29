import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { detectRunner } from "../../../applications/detect/index.js";

export const registerDetectTool = (server: McpServer): void => {
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
};
