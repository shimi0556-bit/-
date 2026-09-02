#!/usr/bin/env node
/**
 * MCP server for OpenAI's Images API (gpt-image-1, with legacy dall-e-2/
 * dall-e-3 support) - generate, edit and vary images from a prompt.
 *
 * Requires OPENAI_API_KEY to be set in the environment.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerGenerateTool } from "./tools/generate.js";
import { registerEditTool } from "./tools/edit.js";
import { registerVariationTool } from "./tools/variation.js";

const server = new McpServer({
  name: "dalle-mcp-server",
  version: "1.0.0",
});

registerGenerateTool(server);
registerEditTool(server);
registerVariationTool(server);

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "Warning: OPENAI_API_KEY is not set. Tool calls will fail until it's configured in this server's environment."
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("dalle-mcp-server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting dalle-mcp-server:", error);
  process.exit(1);
});
