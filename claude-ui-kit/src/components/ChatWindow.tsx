import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import type { Attachment, ChatMessage } from '../types';

export interface ChatWindowProps {
  messages: ChatMessage[];
  onSend: (text: string, attachments: Attachment[]) => void;
  isThinking?: boolean;
  disabled?: boolean;
  placeholder?: string;
  userLabel?: string;
  userAvatarSrc?: string;
  assistantAvatarSrc?: string;
  /** File types accepted by the attachment picker/drop zone. Defaults to images only. */
  accept?: string;
  maxAttachments?: number;
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
  accept,
  maxAttachments,
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
      <ChatInput onSend={onSend} disabled={disabled} placeholder={placeholder} accept={accept} maxAttachments={maxAttachments} />
    </div>
  );
}
