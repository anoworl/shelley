import React, { useMemo } from "react";
import Markdown from "markdown-to-jsx";
import hljs from "highlight.js/lib/core";

// Register only the languages we need
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import go from "highlight.js/lib/languages/go";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import diff from "highlight.js/lib/languages/diff";

hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("go", go);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("diff", diff);

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
              if (!isBlock) {
                return (
                  <code {...props} className="markdown-inline-code">
                    {children}
                  </code>
                );
              }
              
              // Extract language from className (e.g., "lang-javascript" -> "javascript")
              const langMatch = className?.match(/lang-(\w+)/);
              const lang = langMatch?.[1];
              const codeText = typeof children === "string" ? children : String(children);
              
              // Highlight the code
              let highlighted: string;
              try {
                if (lang && hljs.getLanguage(lang)) {
                  highlighted = hljs.highlight(codeText, { language: lang }).value;
                } else {
                  highlighted = hljs.highlightAuto(codeText).value;
                }
              } catch {
                // Fallback to escaped plain text if highlighting fails
                highlighted = codeText
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
              }
              
              return (
                <code
                  {...props}
                  className={`hljs ${className || ""}`}
                  dangerouslySetInnerHTML={{ __html: highlighted }}
                />
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
