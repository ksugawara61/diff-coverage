#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDetectTool } from "./mcp/tools/detect.js";
import { registerDiffTool } from "./mcp/tools/diff.js";
import { registerMeasureTool } from "./mcp/tools/measure.js";
import { registerReviewTool } from "./mcp/tools/review.js";
import { registerUncoveredTool } from "./mcp/tools/uncovered.js";

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
