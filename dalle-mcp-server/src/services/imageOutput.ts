import { promises as fs } from "node:fs";
import path from "node:path";
import { openaiImagesClient } from "./openaiClient.js";
import { extensionForFormat, mimeTypeForFormat, type ImagesApiResponse } from "../types.js";
import { imageContent, type ToolTextResult } from "./format.js";

export interface ResolvedImages {
  content: ToolTextResult["content"];
  structured: Record<string, unknown>;
}

/**
 * Turn an /images/* API response into MCP content: inline image blocks, and/or
 * files written to disk (when save_dir is given). Handles both the b64_json
 * shape (default for gpt-image-* models) and the url shape (dall-e-2/3 with
 * response_format="url").
 */
export async function resolveImages(
  response: ImagesApiResponse,
  opts: { saveDir?: string; baseName?: string; outputFormat?: string }
): Promise<ResolvedImages> {
  const images = response.data ?? [];
  if (images.length === 0) {
    return {
      content: [{ type: "text", text: "OpenAI returned no images." }],
      structured: { count: 0 },
    };
  }

  const format = opts.outputFormat ?? response.output_format ?? "png";
  const mimeType = mimeTypeForFormat(format);
  const ext = extensionForFormat(format);
  const baseName = opts.baseName ?? "image";

  const content: ToolTextResult["content"] = [];
  const savedPaths: string[] = [];
  const revisedPrompts: string[] = [];

  if (opts.saveDir) {
    await fs.mkdir(opts.saveDir, { recursive: true });
  }

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (img.revised_prompt) revisedPrompts.push(img.revised_prompt);

    let buffer: Buffer | undefined;
    if (img.b64_json) {
      buffer = Buffer.from(img.b64_json, "base64");
    } else if (img.url) {
      if (opts.saveDir) {
        buffer = await openaiImagesClient.downloadUrl(img.url);
      } else {
        content.push({ type: "text", text: `Image ${i + 1} URL (valid ~60 minutes): ${img.url}` });
      }
    }

    if (buffer) {
      if (opts.saveDir) {
        const filePath = path.join(
          opts.saveDir,
          images.length > 1 ? `${baseName}_${i + 1}.${ext}` : `${baseName}.${ext}`
        );
        await fs.writeFile(filePath, buffer);
        savedPaths.push(filePath);
      }
      // Always include the first image inline so the agent can see the result directly.
      if (i === 0) {
        content.push(imageContent(buffer.toString("base64"), mimeType));
      }
    }
  }

  if (savedPaths.length > 0) {
    content.unshift({ type: "text", text: `Saved ${savedPaths.length} image(s):\n${savedPaths.join("\n")}` });
  }
  if (revisedPrompts.length > 0) {
    content.push({
      type: "text",
      text: `Note: the model rewrote the prompt before generating:\n${revisedPrompts.join("\n---\n")}`,
    });
  }

  return {
    content,
    structured: {
      count: images.length,
      ...(savedPaths.length > 0 ? { saved_paths: savedPaths } : {}),
      ...(revisedPrompts.length > 0 ? { revised_prompts: revisedPrompts } : {}),
    },
  };
}
