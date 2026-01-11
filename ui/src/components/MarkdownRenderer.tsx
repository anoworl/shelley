import React from "react";
import Markdown from "markdown-to-jsx";

interface MarkdownRendererProps {
  children: string;
}

/**
 * Renders Markdown content as React components.
 * Uses markdown-to-jsx for safe, lightweight rendering.
 * 
 * Features:
 * - GFM support (tables, task lists, strikethrough)
 * - Safe HTML rendering (no dangerouslySetInnerHTML)
 * - Links open in new tab
 */
function MarkdownRenderer({ children }: MarkdownRendererProps) {
  return (
    <Markdown
      options={{
        overrides: {
          // Links open in new tab
          a: {
            component: ({ children, ...props }) => (
              <a {...props} target="_blank" rel="noopener noreferrer" className="text-link">
                {children}
              </a>
            ),
          },
          // Code blocks with styling
          pre: {
            component: ({ children, ...props }) => (
              <pre {...props} className="markdown-pre">
                {children}
              </pre>
            ),
          },
          code: {
            component: ({ children, className, ...props }) => {
              // Inline code vs block code
              const isBlock = className?.includes("lang-");
              return (
                <code {...props} className={isBlock ? className : "markdown-inline-code"}>
                  {children}
                </code>
              );
            },
          },
        },
        forceBlock: true,
      }}
    >
      {children}
    </Markdown>
  );
}

export default MarkdownRenderer;
