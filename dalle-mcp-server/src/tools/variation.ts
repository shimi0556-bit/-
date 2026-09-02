import { z } from "zod";
import { createReadStream } from "node:fs";
import FormDataNode from "form-data";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { openaiImagesClient, handleApiError } from "../services/openaiClient.js";
import { resolveImages } from "../services/imageOutput.js";
import { errorResult } from "../services/format.js";
import { baseNameSchema, nSchema, saveDirSchema } from "../schemas/common.js";

const VariationInputSchema = {
  image_path: z
    .string()
    .min(1)
    .describe("Absolute path to a square PNG file under 4MB, as seen by the machine running this MCP server."),
  n: nSchema,
  size: z
    .enum(["256x256", "512x512", "1024x1024"])
    .optional()
    .describe('Output size. Defaults to "1024x1024".'),
  save_dir: saveDirSchema,
  base_name: baseNameSchema,
};

type VariationInput = {
  image_path: string;
  n: number;
  size?: string;
  save_dir?: string;
  base_name?: string;
};

export function registerVariationTool(server: McpServer): void {
  server.registerTool(
    "dalle_create_image_variation",
    {
      title: "Create Image Variation",
      description: `Generate variation(s) of an existing image, with no text prompt - only dall-e-2 supports this endpoint.

Args:
  - image_path (string, required): local path to a square PNG file under 4MB.
  - n (default 1): how many variations to generate (1-10).
  - size (optional): "256x256"|"512x512"|"1024x1024". Defaults to "1024x1024".
  - save_dir / base_name (optional): where to write the resulting image file(s); omit to get them back inline.

Returns: the resulting image(s) inline, plus file paths if save_dir was given.

Note: this is a dall-e-2-only endpoint. If your OpenAI account/API no longer supports dall-e-2, this call will fail - use dalle_edit_image with gpt-image-1 for a prompt-guided restyle/remix instead.

Requires the OPENAI_API_KEY environment variable to be set for this server.`,
      inputSchema: VariationInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input: VariationInput) => {
      try {
        const form = new FormDataNode();
        form.append("image", createReadStream(input.image_path));
        form.append("model", "dall-e-2");
        form.append("n", String(input.n));
        if (input.size) form.append("size", input.size);

        const response = await openaiImagesClient.postMultipart("/images/variations", form);
        const { content, structured } = await resolveImages(response, {
          saveDir: input.save_dir,
          baseName: input.base_name,
        });
        return { content, structuredContent: structured };
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );
}
