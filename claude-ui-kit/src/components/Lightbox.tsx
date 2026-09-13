import { useEffect } from 'react';

export interface LightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function Lightbox({ src, alt, onClose }: LightboxProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="cui-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <img src={src} alt={alt ?? ''} className="cui-lightbox__img" onClick={(e) => e.stopPropagation()} />
      <button type="button" className="cui-lightbox__close" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  );
}
