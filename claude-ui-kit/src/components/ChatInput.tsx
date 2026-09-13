import { useRef, useState } from 'react';
import { AttachmentChip } from './AttachmentChip';
import { isImageFile } from '../utils/file';
import type { Attachment } from '../types';

export interface ChatInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  /** File types accepted by the picker and drop zone. Defaults to images only. */
  accept?: string;
  /** Max number of staged attachments at once. */
  maxAttachments?: number;
}

let attachmentCounter = 0;
function nextAttachmentId() {
  attachmentCounter += 1;
  return `att_${Date.now()}_${attachmentCounter}`;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = 'Message Claude…',
  accept = 'image/*',
  maxAttachments = 5,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function addFiles(files: FileList | File[]) {
    const room = Math.max(0, maxAttachments - attachments.length);
    const incoming = Array.from(files).slice(0, room);
    const next: Attachment[] = incoming.map((file) => ({
      id: nextAttachmentId(),
      file,
      previewUrl: URL.createObjectURL(file),
      kind: isImageFile(file) ? 'image' : 'file',
    }));
    if (next.length) setAttachments((prev) => [...prev, ...next]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function handleSubmit() {
    const text = value.trim();
    if ((!text && attachments.length === 0) || disabled) return;
    onSend(text, attachments);
    setValue('');
    setAttachments([]);
    requestAnimationFrame(autoResize);
  }

  return (
    <div
      className={`cui-input ${isDragOver ? 'cui-input--dragover' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {attachments.length > 0 && (
        <div className="cui-attachments">
          {attachments.map((a) => (
            <AttachmentChip key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)} />
          ))}
        </div>
      )}
      <div className="cui-input__row">
        <button
          type="button"
          className="cui-input__attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || attachments.length >= maxAttachments}
          aria-label="Attach file"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path
              d="M8 12.5 15.5 5a3.5 3.5 0 1 1 5 5L11 19.5a5.5 5.5 0 1 1-7.8-7.8L12.5 3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
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
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) addFiles(files);
          }}
        />
        <button
          type="button"
          className="cui-input__send"
          onClick={handleSubmit}
          disabled={disabled || (!value.trim() && attachments.length === 0)}
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
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
