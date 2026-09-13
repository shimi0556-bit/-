export type MessageRole = 'user' | 'assistant';

export interface TextBlock {
  type: 'text';
  text: string;
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

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string | ContentBlock[];
  createdAt?: number;
  /** True while this message's text is still arriving (shows a blinking cursor). */
  streaming?: boolean;
}
