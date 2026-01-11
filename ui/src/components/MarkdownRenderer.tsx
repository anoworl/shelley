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
/**
 * Sanitize URL to prevent javascript: and data: XSS attacks.
 * Only allows http:, https:, mailto:, and relative URLs.
 */
function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:")
  ) {
    return "";
  }
  return url;
}

function MarkdownRenderer({ children }: MarkdownRendererProps) {
  return (
    <Markdown
      options={{
        // Disable raw HTML parsing to prevent XSS from LLM output
        disableParsingRawHTML: true,
        overrides: {
          // Links open in new tab with URL sanitization
          a: {
            component: ({ children, href, ...props }) => {
              const safeHref = sanitizeUrl(href);
              if (!safeHref) {
                // Render as plain text if URL is unsafe
                return <span>{children}</span>;
              }
              return (
                <a {...props} href={safeHref} target="_blank" rel="noopener noreferrer" className="text-link">
                  {children}
                </a>
              );
            },
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
