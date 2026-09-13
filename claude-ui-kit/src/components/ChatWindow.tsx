import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import type { ChatMessage } from '../types';

export interface ChatWindowProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isThinking?: boolean;
  disabled?: boolean;
  placeholder?: string;
  userLabel?: string;
  userAvatarSrc?: string;
  assistantAvatarSrc?: string;
  className?: string;
}

export function ChatWindow({
  messages,
  onSend,
  isThinking,
  disabled,
  placeholder,
  userLabel,
  userAvatarSrc,
  assistantAvatarSrc,
  className,
}: ChatWindowProps) {
  return (
    <div className={`cui-root cui-window ${className ?? ''}`}>
      <MessageList
        messages={messages}
        isThinking={isThinking}
        userLabel={userLabel}
        userAvatarSrc={userAvatarSrc}
        assistantAvatarSrc={assistantAvatarSrc}
      />
      <ChatInput onSend={onSend} disabled={disabled} placeholder={placeholder} />
    </div>
  );
}
