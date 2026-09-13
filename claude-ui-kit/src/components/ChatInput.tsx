import { useRef, useState } from 'react';

export interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = 'Message Claude…' }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function handleSubmit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
    requestAnimationFrame(autoResize);
  }

  return (
    <div className="cui-input">
      <textarea
        ref={textareaRef}
        className="cui-input__textarea"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        onChange={(e) => {
          setValue(e.target.value);
          autoResize();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <button
        type="button"
        className="cui-input__send"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M4 12h14m0 0-6-6m6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
