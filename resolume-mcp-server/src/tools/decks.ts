import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolumeClient, handleApiError } from "../services/resolumeClient.js";
import { jsonResult, errorResult } from "../services/format.js";
import { indexSchema } from "../schemas/common.js";

export function registerDeckTools(server: McpServer): void {
  server.registerTool(
    "resolume_list_decks",
    {
      title: "List Decks",
      description: `List every deck (a saved page of columns/layers a VJ can switch between within one composition).

Returns: JSON array of deck objects.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await resolumeClient.getComposition("decks");
        return jsonResult(data);
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_open_deck",
    {
      title: "Open (Switch To) a Deck",
      description: `Switch the composition to a different deck.

Args:
  - deck_index (integer, required): 1-based deck index.

Returns: Resolume's response (typically empty on success).`,
      inputSchema: { deck_index: indexSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ deck_index }: { deck_index: number }) => {
      try {
        const data = await resolumeClient.request("POST", `/composition/decks/${deck_index}/open`);
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );
}
