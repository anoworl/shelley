import React, { useState, useRef, useLayoutEffect } from "react";
import { LLMContent } from "../types";
import MarkdownRenderer from "./MarkdownRenderer";
import { HighlightedCode } from "./HighlightedCode";

interface BashToolProps {
  // For tool_use (pending state)
  toolInput?: unknown;
  isRunning?: boolean;

  // For tool_result (completed state)
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
}

function BashTool({ toolInput, isRunning, toolResult, hasError, executionTime }: BashToolProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const commandRef = useRef<HTMLSpanElement>(null);

  // Extract command from toolInput
  const command =
    typeof toolInput === "object" &&
    toolInput !== null &&
    "command" in toolInput &&
    typeof toolInput.command === "string"
      ? toolInput.command
      : typeof toolInput === "string"
        ? toolInput
        : "";

  // Extract output from toolResult
  const output =
    toolResult && toolResult.length > 0 && toolResult[0].Text ? toolResult[0].Text : "";

  // Check if this was a cancelled operation
  const isCancelled = hasError && output.toLowerCase().includes("cancel");

  // Truncate command for display
  const truncateCommand = (cmd: string, maxLen: number = 300) => {
    if (cmd.length <= maxLen) return cmd;
    return cmd.substring(0, maxLen) + "...";
  };

  const displayCommand = truncateCommand(command);
  const isComplete = !isRunning && toolResult !== undefined;

  // Detect if command text is truncated (by CSS ellipsis or by length)
  const isLengthTruncated = command.length > 300;
  useLayoutEffect(() => {
    const el = commandRef.current;
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [command]);
  const showFullCommand = isTruncated || isLengthTruncated;

  // Detect file type from command (cat, head, tail, etc.)
  const fileReadMatch = command.match(/\b(cat|head|tail|less|more|sed|grep|awk|cut|sort|uniq|wc|diff|strings)\b.*?([\w./-]+\.(\w+))/);
  const fileExtension = fileReadMatch?.[3]?.toLowerCase();
  
  // Map extensions to highlight.js language names
  const extToLang: Record<string, string> = {
    md: "markdown",
    html: "html",
    htm: "html",
    css: "css",
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    go: "go",
    py: "python",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    diff: "diff",
    patch: "diff",
  };
  
  const detectedLang = fileExtension ? extToLang[fileExtension] : undefined;
  const isMarkdown = detectedLang === "markdown";

  return (
    <div
      className="bash-tool"
      data-testid={isComplete ? "tool-call-completed" : "tool-call-running"}
    >
      <div className="bash-tool-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="bash-tool-summary">
          <button
            className="bash-tool-toggle"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            aria-expanded={isExpanded}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            >
              <path
                d="M4.5 3L7.5 6L4.5 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className={`bash-tool-emoji ${isRunning ? "running" : ""}`}>🛠️</span>
          <span className="bash-tool-command" ref={commandRef}>{displayCommand}</span>
        </div>
        <div className="bash-tool-header-right">
          {isComplete && (
            <span className="bash-tool-status">
              {isCancelled ? (
                <span className="bash-tool-cancelled">✗ cancelled</span>
              ) : hasError ? (
                <span className="bash-tool-error">✗</span>
              ) : (
                <span className="bash-tool-success">✓</span>
              )}
            </span>
          )}
          {isComplete && executionTime && (
            <span className="bash-tool-time">{executionTime}</span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="bash-tool-details">
          {showFullCommand && (
            <div className="bash-tool-section">
              <div className="bash-tool-label">Command</div>
              <pre className="bash-tool-code">{command}</pre>
            </div>
          )}

          {isComplete && (
            <div className="bash-tool-section">
              {showFullCommand && (
                <div className="bash-tool-label">
                  Output{hasError ? " (Error)" : ""}
                </div>
              )}
              {!hasError && output && isMarkdown ? (
                <div className="bash-tool-markdown">
                  <MarkdownRenderer>{output}</MarkdownRenderer>
                </div>
              ) : !hasError && output && detectedLang ? (
                <HighlightedCode code={output} language={detectedLang} />
              ) : (
                <pre className={`bash-tool-code ${hasError ? "error" : ""}`}>
                  {output || "(no output)"}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BashTool;
