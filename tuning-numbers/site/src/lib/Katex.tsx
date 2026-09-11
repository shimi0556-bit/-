import { useMemo } from "react";
import katex from "katex";

interface KatexProps {
  tex: string;
  display?: boolean;
  className?: string;
}

/**
 * Renders a LaTeX string with KaTeX. Uses the default htmlAndMathml output so
 * screen readers get the MathML annotation while sighted users get the HTML.
 */
export function Katex({ tex, display = false, className }: KatexProps) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
      }),
    [tex, display],
  );
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
