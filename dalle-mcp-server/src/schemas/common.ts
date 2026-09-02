import { z } from "zod";
import { DEFAULT_MODEL } from "../constants.js";

export const modelSchema = z
  .string()
  .default(DEFAULT_MODEL)
  .describe(
    `Model to use. "gpt-image-1" (default, recommended) supports quality/background/output_format/moderation. ` +
      `Legacy "dall-e-3" (1 image per call, supports "style") and "dall-e-2" (supports edits/variations) remain ` +
      `selectable but may be rejected depending on current OpenAI account/API policy.`
  );

export const nSchema = z
  .number()
  .int()
  .min(1)
  .max(10)
  .default(1)
  .describe("How many images to generate (1-10). dall-e-3 only supports 1.");

export const sizeSchema = z
  .string()
  .optional()
  .describe(
    `Image dimensions as "WIDTHxHEIGHT", or "auto". Valid values depend on the model: gpt-image-1 supports ` +
      `"1024x1024", "1024x1536", "1536x1024" or "auto"; dall-e-3 supports "1024x1024", "1792x1024", "1024x1792"; ` +
      `dall-e-2 supports "256x256", "512x512", "1024x1024". Omit to use the model's default.`
  );

export const qualitySchema = z
  .enum(["auto", "low", "medium", "high", "standard", "hd"])
  .optional()
  .describe(
    `Rendering quality. gpt-image-1 uses "low"|"medium"|"high"|"auto"; dall-e-3 uses "standard"|"hd". Omit for the model's default.`
  );

export const backgroundSchema = z
  .enum(["transparent", "opaque", "auto"])
  .optional()
  .describe(
    `gpt-image-1 only. "transparent" requires output_format "png" or "webp". Omit for the model to decide ("auto").`
  );

export const outputFormatSchema = z
  .enum(["png", "jpeg", "webp"])
  .optional()
  .describe("gpt-image-1 only. File format for the returned/saved image(s). Defaults to png.");

export const moderationSchema = z
  .enum(["low", "auto"])
  .optional()
  .describe('gpt-image-1 only. Content-filtering strictness: "low" is less restrictive. Defaults to "auto".');

export const styleSchema = z
  .enum(["vivid", "natural"])
  .optional()
  .describe('dall-e-3 only. "vivid" leans hyper-real/dramatic, "natural" leans more true-to-life.');

export const saveDirSchema = z
  .string()
  .optional()
  .describe(
    "Absolute local directory to write the generated image(s) to, as seen by the machine running this MCP server. " +
      "When omitted, images are returned inline (base64) instead of being written to disk."
  );

export const baseNameSchema = z
  .string()
  .optional()
  .describe('File name (without extension) to use when saving with save_dir. Defaults to "image".');
