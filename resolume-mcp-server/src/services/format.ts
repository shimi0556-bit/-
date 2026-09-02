import { CHARACTER_LIMIT } from "../constants.js";

export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Serialize a value to pretty JSON, truncating with a clear notice if it's too large. */
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

export function jsonResult(value: unknown, structured?: Record<string, unknown>): ToolTextResult {
  const { text, truncated } = toJsonText(value);
  const note = truncated
    ? "\n\nNote: response was truncated to fit the character limit. Narrow your request (e.g. fetch a single layer/clip instead of the whole composition) to see everything."
    : "";
  return {
    content: [{ type: "text", text: text + note }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

export function textResult(text: string): ToolTextResult {
  return { content: [{ type: "text", text }] };
}

export function errorResult(message: string): ToolTextResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function imageResult(base64Data: string, mimeType: string, caption?: string): ToolTextResult {
  const content: ToolTextResult["content"] = [];
  if (caption) content.push({ type: "text", text: caption });
  content.push({ type: "image", data: base64Data, mimeType });
  return { content };
}
