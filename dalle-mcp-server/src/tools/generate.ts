import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { openaiImagesClient, handleApiError } from "../services/openaiClient.js";
import { resolveImages } from "../services/imageOutput.js";
import { errorResult } from "../services/format.js";
import {
  backgroundSchema,
  baseNameSchema,
  moderationSchema,
  modelSchema,
  nSchema,
  outputFormatSchema,
  qualitySchema,
  saveDirSchema,
  sizeSchema,
  styleSchema,
} from "../schemas/common.js";

const GenerateInputSchema = {
  prompt: z
    .string()
    .min(1)
    .max(32000)
    .describe(
      "Description of the image to generate. Up to 32000 characters for gpt-image-1, 4000 for dall-e-3, 1000 for dall-e-2."
    ),
  model: modelSchema,
  n: nSchema,
  size: sizeSchema,
  quality: qualitySchema,
  background: backgroundSchema,
  output_format: outputFormatSchema,
  moderation: moderationSchema,
  style: styleSchema,
  save_dir: saveDirSchema,
  base_name: baseNameSchema,
};

type GenerateInput = {
  prompt: string;
  model: string;
  n: number;
  size?: string;
  quality?: string;
  background?: string;
  output_format?: string;
  moderation?: string;
  style?: string;
  save_dir?: string;
  base_name?: string;
};

export function registerGenerateTool(server: McpServer): void {
  server.registerTool(
    "dalle_generate_image",
    {
      title: "Generate Image",
      description: `Generate one or more images from a text prompt using OpenAI's image generation API (gpt-image-1 by default, or legacy dall-e-3/dall-e-2).

Args:
  - prompt (string, required): what to draw. Be descriptive - subject, composition, style, lighting, mood.
  - model (string, default "gpt-image-1"): "gpt-image-1" (recommended), "dall-e-3", or "dall-e-2".
  - n (integer, default 1): number of images (1-10). dall-e-3 only supports 1.
  - size (string, optional): e.g. "1024x1024", "1024x1536", "1536x1024" (gpt-image-1); "1792x1024"/"1024x1792" (dall-e-3, landscape/portrait); "256x256"/"512x512" (dall-e-2, smaller/cheaper). Omit for the model's default.
  - quality (optional): "low"|"medium"|"high"|"auto" for gpt-image-1, "standard"|"hd" for dall-e-3.
  - background (optional, gpt-image-1 only): "transparent" (needs output_format png/webp), "opaque", or "auto".
  - output_format (optional, gpt-image-1 only): "png"|"jpeg"|"webp". Defaults to png.
  - moderation (optional, gpt-image-1 only): "low" (less restrictive) or "auto".
  - style (optional, dall-e-3 only): "vivid" or "natural".
  - save_dir (optional): absolute local directory to write the image file(s) to. Omit to get the image back inline instead.
  - base_name (optional): file name (no extension) used when save_dir is set. Defaults to "image".

Returns: the first generated image inline (viewable directly), plus file paths if save_dir was given, plus any revised_prompt the model used instead of your literal prompt.

Requires the OPENAI_API_KEY environment variable to be set for this server.`,
      inputSchema: GenerateInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input: GenerateInput) => {
      try {
        const { save_dir, base_name, ...apiFields } = input;
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(apiFields)) {
          if (value !== undefined) body[key] = value;
        }
        const response = await openaiImagesClient.generate(body);
        const { content, structured } = await resolveImages(response, {
          saveDir: save_dir,
          baseName: base_name,
          outputFormat: input.output_format,
        });
        return { content, structuredContent: structured };
      } catch (error) {
        return errorResult(handleApiError(error));
      }
    }
  );
}
