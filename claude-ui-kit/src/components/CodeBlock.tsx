import { useState } from 'react';

export interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing to fall back to.
    }
  }

  return (
    <div className="cui-codeblock">
      <div className="cui-codeblock__bar">
        <span className="cui-codeblock__lang">{language || 'text'}</span>
        <button type="button" className="cui-codeblock__copy" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="cui-codeblock__pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
