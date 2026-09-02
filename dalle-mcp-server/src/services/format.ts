import { CHARACTER_LIMIT } from "../constants.js";

export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function toJsonText(value: unknown): { text: string; truncated: boolean } {
  const full = JSON.stringify(value, null, 2);
  if (full.length <= CHARACTER_LIMIT) {
    return { text: full, truncated: false };
  }
  const truncatedText = `${full.slice(0, CHARACTER_LIMIT)}\n\n... [truncated ${
    full.length - CHARACTER_LIMIT
  } characters]`;
  return { text: truncatedText, truncated: true };
}

export function textResult(text: string, structured?: Record<string, unknown>): ToolTextResult {
  return {
    content: [{ type: "text", text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

export function errorResult(message: string): ToolTextResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function imageContent(base64Data: string, mimeType: string): ToolTextResult["content"][number] {
  return { type: "image", data: base64Data, mimeType };
}
