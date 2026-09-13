import { useState } from 'react';
import type { ToolResultBlock, ToolUseBlock } from '../types';

export interface ToolCallCardProps {
  call: ToolUseBlock;
  result?: ToolResultBlock;
}

export function ToolCallCard({ call, result }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="cui-tool">
      <button
        type="button"
        className="cui-tool__header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="cui-tool__icon" aria-hidden="true">
          ⚙
        </span>
        <span className="cui-tool__name">{call.name}</span>
        <span className="cui-tool__chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="cui-tool__body">
          <div className="cui-tool__section">
            <div className="cui-tool__label">Input</div>
            <pre className="cui-tool__pre">{JSON.stringify(call.input, null, 2)}</pre>
          </div>
          {result && (
            <div className="cui-tool__section">
              <div className="cui-tool__label">{result.isError ? 'Error' : 'Result'}</div>
              <pre className={`cui-tool__pre ${result.isError ? 'cui-tool__pre--error' : ''}`}>
                {result.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
