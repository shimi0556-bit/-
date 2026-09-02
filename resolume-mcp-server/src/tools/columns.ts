import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolumeClient, handleApiError } from "../services/resolumeClient.js";
import { jsonResult, errorResult } from "../services/format.js";
import { indexSchema } from "../schemas/common.js";

export function registerColumnTools(server: McpServer): void {
  server.registerTool(
    "resolume_list_columns",
    {
      title: "List Columns",
      description: `List every column in the composition. A column groups the clip at that index across all layers, so triggering a column ("connect") plays a whole scene at once.

Returns: JSON array of column objects.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await resolumeClient.getComposition("columns");
        return jsonResult(data);
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_trigger_column",
    {
      title: "Trigger a Column (Whole Scene)",
      description: `Trigger a column, which triggers the clip at that column index on every layer simultaneously - the way to launch a whole "scene" in one call instead of triggering each layer's clip individually.

Args:
  - column_index (integer, required): 1-based column index.

Returns: Resolume's response (typically empty on success).`,
      inputSchema: { column_index: indexSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ column_index }: { column_index: number }) => {
      try {
        const data = await resolumeClient.request("POST", `/composition/columns/${column_index}/connect`);
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );
}
