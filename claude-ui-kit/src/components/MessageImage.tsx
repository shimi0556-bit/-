import { useState } from 'react';
import { Lightbox } from './Lightbox';
import type { ImageBlock } from '../types';

export interface MessageImageProps {
  block: ImageBlock;
}

function srcFor(block: ImageBlock): string {
  return block.source.type === 'base64'
    ? `data:${block.source.media_type};base64,${block.source.data}`
    : block.source.url;
}

export function MessageImage({ block }: MessageImageProps) {
  const [open, setOpen] = useState(false);
  const src = srcFor(block);

  return (
    <>
      <button type="button" className="cui-image-button" onClick={() => setOpen(true)} aria-label="View image">
        <img src={src} alt="" className="cui-image" />
      </button>
      {open && <Lightbox src={src} onClose={() => setOpen(false)} />}
    </>
  );
}
