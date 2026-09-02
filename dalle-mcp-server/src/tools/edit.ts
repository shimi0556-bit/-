import { z } from "zod";
import { createReadStream } from "node:fs";
import FormDataNode from "form-data";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { openaiImagesClient, handleApiError } from "../services/openaiClient.js";
import { resolveImages } from "../services/imageOutput.js";
import { errorResult } from "../services/format.js";
import {
  backgroundSchema,
  baseNameSchema,
  modelSchema,
  nSchema,
  outputFormatSchema,
  qualitySchema,
  saveDirSchema,
  sizeSchema,
} from "../schemas/common.js";

const EditInputSchema = {
  image_paths: z
    .array(z.string().min(1))
    .min(1)
    .max(16)
    .describe(
      "Absolute path(s) to the source image file(s), as seen by the machine running this MCP server. " +
        "dall-e-2 accepts exactly one square PNG under 4MB. gpt-image-1 accepts up to 16 PNG/WEBP/JPG files, each under 25MB."
    ),
  mask_path: z
    .string()
    .optional()
    .describe(
      "Absolute path to a PNG mask, same dimensions as the (single) source image, where transparent areas mark what to replace. Optional - omit to let the model decide what to edit based on the prompt."
    ),
  prompt: z
    .string()
    .min(1)
    .max(32000)
    .describe("Description of the desired edit/result. Up to 32000 characters for gpt-image-1, 1000 for dall-e-2."),
  model: modelSchema,
  n: nSchema,
  size: sizeSchema,
  quality: qualitySchema,
  background: backgroundSchema,
  output_format: outputFormatSchema,
  input_fidelity: z
    .enum(["high", "low"])
    .optional()
    .describe(
      'gpt-image-1 only. "high" tries harder to preserve faces/features/style from the source image(s). Defaults to "low".'
    ),
  save_dir: saveDirSchema,
  base_name: baseNameSchema,
};

type EditInput = {
  image_paths: string[];
  mask_path?: string;
  prompt: string;
  model: string;
  n: number;
  size?: string;
  quality?: string;
  background?: string;
  output_format?: string;
  input_fidelity?: string;
  save_dir?: string;
  base_name?: string;
};

export function registerEditTool(server: McpServer): void {
  server.registerTool(
    "dalle_edit_image",
    {
      title: "Edit Image",
      description: `Edit existing image(s) with a text prompt - inpaint a masked region, or (with gpt-image-1) combine/restyle multiple reference images into one new image.

Args:
  - image_paths (string[], required): local path(s) to the source image(s). dall-e-2 takes exactly one square PNG (<4MB); gpt-image-1 takes up to 16 PNG/WEBP/JPG files (<25MB each).
  - mask_path (string, optional): local path to a PNG mask (transparent = area to replace). Only meaningful with a single source image. Omit to let the model infer what to change from the prompt.
  - prompt (string, required): what the final image should look like.
  - model (default "gpt-image-1"): "gpt-image-1" or "dall-e-2".
  - n, size, quality, background, output_format: same meaning as in dalle_generate_image.
  - input_fidelity (optional, gpt-image-1 only): "high" to preserve faces/style from the source more closely.
  - save_dir / base_name (optional): where to write the resulting image file(s); omit to get the image back inline.

Returns: the resulting image inline, plus file paths if save_dir was given.

Requires the OPENAI_API_KEY environment variable to be set for this server.`,
      inputSchema: EditInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input: EditInput) => {
      try {
        const form = new FormDataNode();
        form.append("prompt", input.prompt);
        form.append("model", input.model);
        form.append("n", String(input.n));
        if (input.size) form.append("size", input.size);
        if (input.quality) form.append("quality", input.quality);
        if (input.background) form.append("background", input.background);
        if (input.output_format) form.append("output_format", input.output_format);
        if (input.input_fidelity) form.append("input_fidelity", input.input_fidelity);

        const imageField = input.image_paths.length === 1 ? "image" : "image[]";
        for (const imagePath of input.image_paths) {
          form.append(imageField, createReadStream(imagePath));
        }
        if (input.mask_path) {
          form.append("mask", createReadStream(input.mask_path));
        }

        const response = await openaiImagesClient.postMultipart("/images/edits", form);
        const { content, structured } = await resolveImages(response, {
          saveDir: input.save_dir,
          baseName: input.base_name,
          outputFormat: input.output_format,
        });
        return { content, structuredContent: structured };
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );
}
