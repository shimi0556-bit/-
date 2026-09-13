import { Avatar } from './Avatar';
import { Markdown } from './Markdown';
import { ToolCallCard } from './ToolCallCard';
import type { ChatMessage, ContentBlock, ToolResultBlock, ToolUseBlock } from '../types';

export interface MessageBubbleProps {
  message: ChatMessage;
  userLabel?: string;
  userAvatarSrc?: string;
  assistantAvatarSrc?: string;
}

export function MessageBubble({ message, userLabel, userAvatarSrc, assistantAvatarSrc }: MessageBubbleProps) {
  const blocks: ContentBlock[] =
    typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;

  const resultsByCallId = new Map<string, ToolResultBlock>();
  for (const block of blocks) {
    if (block.type === 'tool_result') resultsByCallId.set(block.tool_use_id, block);
  }

  return (
    <div className={`cui-message cui-message--${message.role}`}>
      <Avatar
        role={message.role}
        src={message.role === 'user' ? userAvatarSrc : assistantAvatarSrc}
        label={message.role === 'user' ? userLabel : 'Claude'}
      />
      <div className="cui-message__content">
        {blocks.map((block, i) => {
          if (block.type === 'text') {
            return <Markdown key={i} content={block.text} />;
          }
          if (block.type === 'tool_use') {
            const call = block as ToolUseBlock;
            return <ToolCallCard key={call.id} call={call} result={resultsByCallId.get(call.id)} />;
          }
          return null;
        })}
        {message.streaming && <span className="cui-cursor" aria-hidden="true" />}
      </div>
    </div>
  );
}
