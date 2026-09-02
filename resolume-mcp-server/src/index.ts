#!/usr/bin/env node
/**
 * MCP server for controlling Resolume Arena/Avenue (VJ / live video mixing
 * software) over its local REST API.
 *
 * Requires Resolume Arena or Avenue to be running with
 * Preferences -> Webserver -> "Enable REST API" turned on.
 * Configure host/port via RESOLUME_HOST / RESOLUME_PORT env vars
 * (defaults: 127.0.0.1:8080).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerMetaTools } from "./tools/meta.js";
import { registerCompositionTools } from "./tools/composition.js";
import { registerLayerTools } from "./tools/layers.js";
import { registerClipTools } from "./tools/clips.js";
import { registerColumnTools } from "./tools/columns.js";
import { registerDeckTools } from "./tools/decks.js";

const server = new McpServer({
  name: "resolume-mcp-server",
  version: "1.0.0",
});

registerMetaTools(server);
registerCompositionTools(server);
registerLayerTools(server);
registerClipTools(server);
registerColumnTools(server);
registerDeckTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("resolume-mcp-server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting resolume-mcp-server:", error);
  process.exit(1);
});
