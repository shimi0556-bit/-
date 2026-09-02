import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolumeClient, handleApiError } from "../services/resolumeClient.js";
import { jsonResult, errorResult } from "../services/format.js";

export function registerCompositionTools(server: McpServer): void {
  server.registerTool(
    "resolume_new_composition",
    {
      title: "New Composition",
      description: `Create a new, empty composition, discarding the current one (Resolume will prompt to save unsaved changes locally, but this call itself does not prompt - save first with resolume_save_composition if you want to keep the current show).

Returns: Resolume's response (typically empty on success).`,
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async () => {
      try {
        const data = await resolumeClient.request("POST", "/composition/new");
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_open_composition",
    {
      title: "Open Composition File",
      description: `Open a .avc composition file from disk, replacing the current composition.

Args:
  - file_path (string, required): absolute path to the .avc file, as seen by the machine running Resolume.

Returns: Resolume's response (typically empty on success).`,
      inputSchema: {
        file_path: z.string().min(1).describe("Absolute path to the .avc composition file."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ file_path }: { file_path: string }) => {
      try {
        const data = await resolumeClient.request("POST", "/composition/open", { value: file_path });
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_save_composition",
    {
      title: "Save Composition",
      description: `Save the current composition. If 'file_path' is given, saves a copy to that path (save-as); otherwise saves over the composition's current file.

Args:
  - file_path (string, optional): absolute path to save to. Omit to save in place.

Returns: Resolume's response (typically empty on success).`,
      inputSchema: {
        file_path: z.string().optional().describe("Absolute path to save-as. Omit to save in place."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ file_path }: { file_path?: string }) => {
      try {
        const data = await resolumeClient.request(
          "POST",
          "/composition/save",
          file_path ? { value: file_path } : undefined
        );
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_stop_all",
    {
      title: "Stop / Blackout All Layers",
      description: `Disconnect every playing clip on every layer - the "panic button" / blackout for a live show. Layers with a "bypassed" empty clip slot behave as if nothing is playing.

Returns: Resolume's response (typically empty on success).`,
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await resolumeClient.request("POST", "/composition/disconnect-all");
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );
}
