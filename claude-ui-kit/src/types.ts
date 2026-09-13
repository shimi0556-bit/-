export type MessageRole = 'user' | 'assistant';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ImageBlock {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string };
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  isError?: boolean;
}

export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string | ContentBlock[];
  createdAt?: number;
  /** True while this message's text is still arriving (shows a blinking cursor). */
  streaming?: boolean;
}

/** A file picked, dropped, or pasted into ChatInput, staged before send. */
export interface Attachment {
  id: string;
  file: File;
  /** Object URL for local preview — caller/consumer should not persist this. */
  previewUrl: string;
  kind: 'image' | 'file';
}
