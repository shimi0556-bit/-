import { useCallback, useRef, useState } from 'react';
import { fileToBase64 } from '../utils/file';
import type { Attachment, ChatMessage, ContentBlock, ImageBlock } from '../types';

/**
 * Streams a reply for the given message history, invoking `onDelta` with each
 * text chunk as it arrives. Implement this against your own backend — never
 * call the Anthropic API directly from the browser with a secret key.
 */
export type StreamFn = (messages: ChatMessage[], onDelta: (textDelta: string) => void) => Promise<void>;

export interface UseClaudeChatOptions {
  initialMessages?: ChatMessage[];
  stream: StreamFn;
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `msg_${Date.now()}_${idCounter}`;
}

export function useClaudeChat({ initialMessages = [], stream }: UseClaudeChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sendMessage = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      const imageBlocks: ImageBlock[] = await Promise.all(
        attachments
          .filter((a) => a.kind === 'image')
          .map(async (a): Promise<ImageBlock> => {
            const { mediaType, data } = await fileToBase64(a.file);
            return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
          }),
      );

      const content: ContentBlock[] = text ? [...imageBlocks, { type: 'text', text }] : imageBlocks;

      const userMessage: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: imageBlocks.length > 0 ? content : text,
        createdAt: Date.now(),
      };
      const assistantId = nextId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        streaming: true,
      };

      const historyForRequest = [...messagesRef.current, userMessage];
      setMessages([...historyForRequest, assistantMessage]);
      setIsStreaming(true);

      try {
        await stream(historyForRequest, (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: (typeof m.content === 'string' ? m.content : '') + delta } : m,
            ),
          );
        });
      } finally {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
        setIsStreaming(false);
      }
    },
    [stream],
  );

  return { messages, sendMessage, isStreaming };
}
