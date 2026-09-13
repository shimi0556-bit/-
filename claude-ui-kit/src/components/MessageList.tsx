import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { Avatar } from './Avatar';
import type { ChatMessage } from '../types';

export interface MessageListProps {
  messages: ChatMessage[];
  /** Shows a typing indicator bubble while true (e.g. before the first token arrives). */
  isThinking?: boolean;
  userLabel?: string;
  userAvatarSrc?: string;
  assistantAvatarSrc?: string;
}

export function MessageList({
  messages,
  isThinking,
  userLabel,
  userAvatarSrc,
  assistantAvatarSrc,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isThinking]);

  return (
    <div className="cui-messages">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          userLabel={userLabel}
          userAvatarSrc={userAvatarSrc}
          assistantAvatarSrc={assistantAvatarSrc}
        />
      ))}
      {isThinking && (
        <div className="cui-message cui-message--assistant">
          <Avatar role="assistant" src={assistantAvatarSrc} label="Claude" />
          <div className="cui-message__content">
            <TypingIndicator />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
