import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolumeClient, handleApiError } from "../services/resolumeClient.js";
import { jsonResult, errorResult, imageResult } from "../services/format.js";
import { indexSchema } from "../schemas/common.js";

export function registerClipTools(server: McpServer): void {
  server.registerTool(
    "resolume_list_clips",
    {
      title: "List Clips On a Layer",
      description: `List every clip slot on a layer (empty and filled), in column order.

Args:
  - layer_index (integer, required): 1-based layer index.

Returns: JSON array of clip objects.`,
      inputSchema: { layer_index: indexSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ layer_index }: { layer_index: number }) => {
      try {
        const data = await resolumeClient.getComposition(`layers/${layer_index}/clips`);
        return jsonResult(data);
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_get_clip",
    {
      title: "Get Clip",
      description: `Get full detail for one clip: its name, media source, transport state (playing/paused/position/speed), and video/audio/effect parameters.

Args:
  - layer_index (integer, required): 1-based layer index.
  - clip_index (integer, required): 1-based clip/column index on that layer.

Returns: JSON clip object.`,
      inputSchema: { layer_index: indexSchema, clip_index: indexSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ layer_index, clip_index }: { layer_index: number; clip_index: number }) => {
      try {
        const data = await resolumeClient.getComposition(`layers/${layer_index}/clips/${clip_index}`);
        return jsonResult(data);
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_trigger_clip",
    {
      title: "Trigger (Play) a Clip",
      description: `Trigger a clip so it starts playing on its layer, following that layer's transition/BPM-sync settings - equivalent to clicking the clip in Resolume's clip grid.

Args:
  - layer_index (integer, required): 1-based layer index.
  - clip_index (integer, required): 1-based clip/column index to trigger.

Returns: Resolume's response (typically empty on success).`,
      inputSchema: { layer_index: indexSchema, clip_index: indexSchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ layer_index, clip_index }: { layer_index: number; clip_index: number }) => {
      try {
        const data = await resolumeClient.request(
          "POST",
          `/composition/layers/${layer_index}/clips/${clip_index}/connect`
        );
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_clear_clip",
    {
      title: "Clear a Clip Slot",
      description: `Empty out a single clip slot, removing whatever media is loaded there.

Args:
  - layer_index (integer, required): 1-based layer index.
  - clip_index (integer, required): 1-based clip/column index.

Returns: Resolume's response (typically empty on success).`,
      inputSchema: { layer_index: indexSchema, clip_index: indexSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ layer_index, clip_index }: { layer_index: number; clip_index: number }) => {
      try {
        const data = await resolumeClient.request(
          "POST",
          `/composition/layers/${layer_index}/clips/${clip_index}/clear`
        );
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_open_clip_file",
    {
      title: "Load a Media File Into a Clip Slot",
      description: `Load a video/image/audio file from disk into a clip slot (creating or replacing whatever's there), and select it in Resolume's clip grid. This does not start playback by itself - call resolume_trigger_clip afterwards to play it.

Args:
  - layer_index (integer, required): 1-based layer index.
  - clip_index (integer, required): 1-based clip/column index to load the file into.
  - file_path (string, required): absolute path to the media file, as seen by the machine running Resolume.

Returns: Resolume's response (typically empty on success).`,
      inputSchema: {
        layer_index: indexSchema,
        clip_index: indexSchema,
        file_path: z.string().min(1).describe("Absolute path to the media file."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({
      layer_index,
      clip_index,
      file_path,
    }: {
      layer_index: number;
      clip_index: number;
      file_path: string;
    }) => {
      try {
        const data = await resolumeClient.request(
          "POST",
          `/composition/layers/${layer_index}/clips/${clip_index}/openfile`,
          { value: file_path }
        );
        return jsonResult(data ?? { ok: true });
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );

  server.registerTool(
    "resolume_get_clip_thumbnail",
    {
      title: "Get Clip Thumbnail Image",
      description: `Fetch the current thumbnail image Resolume has generated for a clip, as an image the agent can view directly.

Args:
  - layer_index (integer, required): 1-based layer index.
  - clip_index (integer, required): 1-based clip/column index.

Returns: a JPEG image, or an error if the clip is empty or has no thumbnail yet.`,
      inputSchema: { layer_index: indexSchema, clip_index: indexSchema },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ layer_index, clip_index }: { layer_index: number; clip_index: number }) => {
      try {
        const data = await resolumeClient.request<ArrayBuffer>(
          "GET",
          `/composition/layers/${layer_index}/clips/${clip_index}/thumbnail`,
          undefined,
          { responseType: "arraybuffer" }
        );
        const base64 = Buffer.from(data).toString("base64");
        return imageResult(base64, "image/jpeg");
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );
}
