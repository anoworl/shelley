import React from "react";
import hljs from "highlight.js/lib/core";

// Languages are already registered in MarkdownRenderer.tsx
// This component just uses them

interface HighlightedCodeProps {
  code: string;
  language?: string;
}

export function HighlightedCode({ code, language }: HighlightedCodeProps) {
  let highlighted: string;
  
  try {
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(code, { language }).value;
    } else {
      highlighted = hljs.highlightAuto(code).value;
    }
  } catch {
    // Fallback to plain text
    highlighted = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  
  return (
    <pre className="bash-tool-code">
      <code
        className="hljs"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  );
}
