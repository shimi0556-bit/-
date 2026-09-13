import { useState } from 'react';
import { ChatWindow, useClaudeChat } from '../src';
import type { ChatMessage, StreamFn } from '../src';

const SAMPLE_REPLY = [
  "Sure — here's a quick example:\n\n",
  '```ts\n',
  'function add(a: number, b: number) {\n',
  '  return a + b;\n',
  '}\n',
  '```\n\n',
  "I'll also check something for you.",
].join('');

const initialMessages: ChatMessage[] = [
  { id: 'seed-1', role: 'user', content: 'Can you show me a TypeScript add function?' },
  {
    id: 'seed-2',
    role: 'assistant',
    content: [
      { type: 'text', text: 'Sure, here you go:\n\n```ts\nfunction add(a: number, b: number) {\n  return a + b;\n}\n```' },
      {
        type: 'tool_use',
        id: 'call_1',
        name: 'run_tests',
        input: { file: 'add.test.ts' },
      },
      { type: 'tool_result', tool_use_id: 'call_1', content: '1 passed, 0 failed' },
    ],
  },
];

// Fakes a streaming backend for the demo. A real implementation calls your
// server, which in turn streams from the Anthropic Messages API.
const fakeStream: StreamFn = async (_messages, onDelta) => {
  for (const char of SAMPLE_REPLY) {
    await new Promise((r) => setTimeout(r, 12));
    onDelta(char);
  }
};

export function App() {
  const { messages, sendMessage, isStreaming } = useClaudeChat({ initialMessages, stream: fakeStream });
  const [dark, setDark] = useState(false);

  return (
    <div className="demo-shell">
      <button
        type="button"
        onClick={() => setDark((v) => !v)}
        style={{ position: 'fixed', top: 12, right: 12, zIndex: 1 }}
      >
        Toggle theme
      </button>
      <ChatWindow
        messages={messages}
        onSend={sendMessage}
        isThinking={isStreaming && messages[messages.length - 1]?.content === ''}
        disabled={isStreaming}
        className={dark ? 'cui-dark' : 'cui-light'}
      />
    </div>
  );
}
