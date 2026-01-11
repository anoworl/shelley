import React, { useState } from "react";
import { LLMContent } from "../types";

interface DeploySelfToolProps {
  // For tool_use (pending state)
  toolInput?: unknown;
  isRunning?: boolean;

  // For tool_result (completed state)
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
}

function DeploySelfTool({
  toolInput,
  isRunning,
  toolResult,
  hasError,
  executionTime,
}: DeploySelfToolProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract source_binary from toolInput
  const sourceBinary =
    typeof toolInput === "object" &&
    toolInput !== null &&
    "source_binary" in toolInput &&
    typeof (toolInput as { source_binary: unknown }).source_binary === "string"
      ? (toolInput as { source_binary: string }).source_binary
      : "";

  // Extract output from toolResult
  const output =
    toolResult && toolResult.length > 0 && toolResult[0].Text ? toolResult[0].Text : "";

  const isComplete = !isRunning && toolResult !== undefined;

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
          <span className={`bash-tool-emoji ${isRunning ? "running" : ""}`}>🚀</span>
          <span className="bash-tool-command">deploy_self</span>
        </div>
        <div className="bash-tool-header-right">
          {isComplete && (
            <span className="bash-tool-status">
              {hasError ? (
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

      {isExpanded && isComplete && (
        <div className="bash-tool-details">
          <div className="bash-tool-section">
            <pre className={`bash-tool-code ${hasError ? "error" : ""}`}>
              {output || "(no output)"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeploySelfTool;
