import { formatBytes } from '../utils/file';
import type { Attachment } from '../types';

export interface AttachmentChipProps {
  attachment: Attachment;
  onRemove: () => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  return (
    <div className="cui-attachment">
      {attachment.kind === 'image' ? (
        <img src={attachment.previewUrl} alt="" className="cui-attachment__thumb" />
      ) : (
        <div className="cui-attachment__file">
          <span className="cui-attachment__icon" aria-hidden="true">
            📄
          </span>
          <span className="cui-attachment__name">{attachment.file.name}</span>
          <span className="cui-attachment__size">{formatBytes(attachment.file.size)}</span>
        </div>
      )}
      <button type="button" className="cui-attachment__remove" onClick={onRemove} aria-label="Remove attachment">
        ×
      </button>
    </div>
  );
}
