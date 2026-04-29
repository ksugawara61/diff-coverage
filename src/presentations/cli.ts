#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Command } from "commander";
import { registerDetectCommand } from "./cli/commands/detect.js";
import { registerDiffCommand } from "./cli/commands/diff.js";
import { registerMeasureCommand } from "./cli/commands/measure.js";
import { registerReviewCommand } from "./cli/commands/review.js";
import { registerTypecheckCommand } from "./cli/commands/typecheck.js";
import { registerDetectTool } from "./mcp/tools/detect.js";
import { registerDiffTool } from "./mcp/tools/diff.js";
import { registerMeasureTool } from "./mcp/tools/measure.js";
import { registerReviewTool } from "./mcp/tools/review.js";
import { registerUncoveredTool } from "./mcp/tools/uncovered.js";

if (process.argv.includes("--mcp")) {
  const server = new McpServer({
    name: "diff-coverage",
    version: "0.1.0",
  });

  registerMeasureTool(server);
  registerDiffTool(server);
  registerUncoveredTool(server);
  registerDetectTool(server);
  registerReviewTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  const program = new Command();

  program
    .name("diff-coverage")
    .description("Measure test coverage for git diff files (Jest or Vitest)")
    .version("0.1.0");

  registerMeasureCommand(program);
  registerDiffCommand(program);
  registerDetectCommand(program);
  registerTypecheckCommand(program);
  registerReviewCommand(program);

  program.parse();
}
