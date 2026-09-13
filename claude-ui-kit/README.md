# claude-ui-kit

React components for building chat interfaces powered by Claude — message
bubbles with Markdown and code-block rendering, tool-call cards, image
attachments with a lightbox, a typing indicator, an auto-resizing chat input,
and a `ChatWindow` that wires them together. Ships as a small, themeable
design system (CSS variables, light + dark) rather than a full framework.

## Install

```bash
npm install claude-ui-kit
```

```tsx
import { ChatWindow, useClaudeChat } from 'claude-ui-kit';
import 'claude-ui-kit/styles.css';
```

## Quick start

```tsx
import { ChatWindow, useClaudeChat, type StreamFn } from 'claude-ui-kit';
import 'claude-ui-kit/styles.css';

// Implement this against YOUR backend. Never call the Anthropic API directly
// from the browser with a secret key — proxy through a server that streams
// the Messages API response back to the client.
const stream: StreamFn = async (messages, onDelta) => {
  const res = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages }),
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onDelta(decoder.decode(value));
  }
};

export function App() {
  const { messages, sendMessage, isStreaming } = useClaudeChat({ stream });

  return (
    <div style={{ height: '100vh' }}>
      <ChatWindow messages={messages} onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
```

## Components

| Component | Purpose |
|---|---|
| `ChatWindow` | Composes `MessageList` + `ChatInput` into a full chat panel |
| `MessageList` | Scrolls a list of `ChatMessage`s, auto-follows new content |
| `MessageBubble` | Renders one message — text (Markdown), tool calls, streaming cursor |
| `ChatInput` | Auto-resizing textarea, Enter to send / Shift+Enter for newline |
| `Markdown` | GFM Markdown renderer with fenced code blocks |
| `CodeBlock` | Code block with a language tag and copy button |
| `ToolCallCard` | Collapsible `tool_use` / `tool_result` display |
| `MessageImage`, `Lightbox` | Renders an `image` content block, click to view full-size |
| `AttachmentChip` | Staged-attachment preview shown above the input before sending |
| `Avatar`, `TypingIndicator` | Small building blocks used by the above |

Each component also works standalone if you want to build your own layout
instead of `ChatWindow`.

## Data model

```ts
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string | ContentBlock[]; // text | image | tool_use | tool_result blocks
  streaming?: boolean; // shows a blinking cursor while true
}
```

`content` can be a plain string, or an array of blocks mirroring the shape of
the Anthropic Messages API content blocks (`text`, `image`, `tool_use`,
`tool_result`), so you can pass a model response straight through with
minimal mapping.

## Attachments & images

`ChatInput` (and `ChatWindow`) include a paperclip button, drag-and-drop onto
the input, and paste-from-clipboard — all staged as `Attachment[]` and shown
as `AttachmentChip` previews before sending. By default only images are
accepted (`accept="image/*"`); pass a wider `accept` and handle non-image
`Attachment.kind === 'file'` yourself if you need documents too.

`useClaudeChat`'s `sendMessage(text, attachments)` converts image attachments
to base64 `image` content blocks and includes them in the user message it
hands to your `stream` function — the same message array your backend can
forward to the Anthropic Messages API almost as-is:

```tsx
const { sendMessage } = useClaudeChat({ stream });
// user picks/drops/pastes a photo, types a caption, hits send:
<ChatWindow messages={messages} onSend={sendMessage} accept="image/*" maxAttachments={4} />
```

Received images render the same way — a `MessageBubble` with an `image` block
shows a thumbnail that opens in a full-size `Lightbox` on click.

## Theming

Every color is a CSS custom property scoped under `.cui-root` (the class
`ChatWindow` renders). Override any of them per-instance:

```css
.my-chat {
  --cui-accent: #4f46e5;
  --cui-radius: 8px;
}
```

Dark mode follows `prefers-color-scheme` by default; force it either way with
the `cui-dark` / `cui-light` class.

## Local development

```bash
npm install
npm run dev:demo    # Vite demo app at localhost:5183, mock streaming backend
npm run build        # builds dist/ (ESM + CJS + .d.ts) via tsup
npm run typecheck
```
