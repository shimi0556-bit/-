import type { MessageRole } from '../types';

export interface AvatarProps {
  role: MessageRole;
  src?: string;
  label?: string;
}

export function Avatar({ role, src, label }: AvatarProps) {
  if (src) {
    return <img className="cui-avatar" src={src} alt={label ?? role} />;
  }

  return (
    <div className={`cui-avatar cui-avatar--${role}`} aria-hidden="true">
      {role === 'assistant' ? (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
          <path
            d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span>{(label ?? 'U').charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}
