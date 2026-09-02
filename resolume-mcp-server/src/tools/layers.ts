import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolumeClient, handleApiError } from "../services/resolumeClient.js";
import { jsonResult, errorResult } from "../services/format.js";
import { indexSchema } from "../schemas/common.js";

export function registerLayerTools(server: McpServer): void {
  server.registerTool(
    "resolume_list_layers",
    {
      title: "List Layers",
      description: `List every layer in the composition (top to bottom, as in the Resolume UI), with their names, ids and current state.

Returns: JSON array of layer objects.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await resolumeClient.getComposition("layers");
        return jsonResult(data);
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_get_layer",
    {
      title: "Get Layer",
      description: `Get full detail for a single layer, including its clips, video/audio mix parameters and effects.

Args:
  - layer_index (integer, required): 1-based layer index as shown in the Resolume UI.

Returns: JSON layer object.`,
      inputSchema: { layer_index: indexSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ layer_index }: { layer_index: number }) => {
      try {
        const data = await resolumeClient.getComposition(`layers/${layer_index}`);
        return jsonResult(data);
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_add_layer",
    {
      title: "Add Layer",
      description: `Add a new, empty layer to the composition (added above the currently selected layer).

Returns: Resolume's response (typically empty on success). Call resolume_list_layers afterwards to find the new layer's index.`,
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async () => {
      try {
        const data = await resolumeClient.request("POST", "/composition/layers/add");
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_clear_layer",
    {
      title: "Clear Layer or Its Clips",
      description: `Either remove a layer entirely, or just clear (empty out) every clip slot on it while keeping the layer.

Args:
  - layer_index (integer, required): 1-based layer index.
  - mode ("remove"|"clips", default "clips"): "clips" empties every clip on the layer; "remove" deletes the layer itself.

Returns: Resolume's response (typically empty on success).`,
      inputSchema: {
        layer_index: indexSchema,
        mode: z
          .enum(["remove", "clips"])
          .default("clips")
          .describe('"clips" empties clips but keeps the layer; "remove" deletes the layer.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ layer_index, mode }: { layer_index: number; mode: "remove" | "clips" }) => {
      try {
        const endpoint = mode === "remove" ? "clear" : "clearclips";
        const data = await resolumeClient.request("POST", `/composition/layers/${layer_index}/${endpoint}`);
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );
}
