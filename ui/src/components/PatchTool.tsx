import React, { useState } from "react";
import { LLMContent } from "../types";
import { buildVSCodeUrl } from "../services/vscode";

interface PatchToolProps {
  // For tool_use (pending state)
  toolInput?: unknown;
  isRunning?: boolean;

  // For tool_result (completed state)
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
  display?: unknown; // Display data from the tool_result Content (contains the diff)
}

function PatchTool({
  toolInput,
  isRunning,
  toolResult,
  hasError,
  executionTime,
  display,
}: PatchToolProps) {
  // Default to collapsed for errors (since agents typically recover), expanded otherwise
  const [isExpanded, setIsExpanded] = useState(!hasError);

  // Extract path from toolInput
  const path =
    typeof toolInput === "object" &&
    toolInput !== null &&
    "path" in toolInput &&
    typeof toolInput.path === "string"
      ? toolInput.path
      : typeof toolInput === "string"
        ? toolInput
        : "";

  // Extract diff from display (preferred) or fall back to toolResult
  const diff =
    typeof display === "string"
      ? display
      : toolResult && toolResult.length > 0 && toolResult[0].Text
        ? toolResult[0].Text
        : "";

  const isComplete = !isRunning && toolResult !== undefined;

  // Parse unified diff to extract filename and line info
  const parseDiff = (diffText: string) => {
    if (!diffText) return { filename: path, parsedLines: [] as { text: string; lineNumber: number | null; type: string }[] };

    const rawLines = diffText.split("\n");
    let filename = path;
    let currentLine = 0;
    const parsedLines: { text: string; lineNumber: number | null; type: string }[] = [];

    for (const line of rawLines) {
      // Extract filename from diff header
      if (line.startsWith("---")) {
        const match = line.match(/^---\s+(.+?)\s*$/);
        if (match) {
          filename = match[1].replace(/^[ab]\//, "");
        }
        parsedLines.push({ text: line, lineNumber: null, type: "header" });
        continue;
      }

      if (line.startsWith("+++")) {
        parsedLines.push({ text: line, lineNumber: null, type: "header" });
        continue;
      }

      // Parse hunk header @@ -old,count +new,count @@
      const hunkMatch = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (hunkMatch) {
        currentLine = parseInt(hunkMatch[1], 10);
        parsedLines.push({ text: line, lineNumber: null, type: "hunk" });
        continue;
      }

      // Addition line
      if (line.startsWith("+")) {
        parsedLines.push({ text: line, lineNumber: currentLine, type: "addition" });
        currentLine++;
        continue;
      }

      // Deletion line (no line number in new file)
      if (line.startsWith("-")) {
        parsedLines.push({ text: line, lineNumber: null, type: "deletion" });
        continue;
      }

      // Context line
      parsedLines.push({ text: line, lineNumber: currentLine, type: "context" });
      currentLine++;
    }

    return { filename, parsedLines };
  };

  const { filename, parsedLines } = parseDiff(diff);

  return (
    <div
      className="patch-tool"
      data-testid={isComplete ? "tool-call-completed" : "tool-call-running"}
    >
      <div className="patch-tool-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="patch-tool-summary">
          <span className={`patch-tool-emoji ${isRunning ? "running" : ""}`}>🖋️</span>
          <span className="patch-tool-filename">{filename || "patch"}</span>
          {isComplete && hasError && <span className="patch-tool-error">✗</span>}
          {isComplete && !hasError && <span className="patch-tool-success">✓</span>}
        </div>
        <button
          className="patch-tool-toggle"
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
      </div>

      {isExpanded && (
        <div className="patch-tool-details">
          {isComplete && !hasError && diff && (
            <div className="patch-tool-section">
              <div className="patch-tool-diff">
                {parsedLines.map((pl, idx) => {
                  const className = `patch-diff-line patch-diff-${pl.type}`;
                  const lineUrl = pl.lineNumber ? buildVSCodeUrl(path, pl.lineNumber) : null;

                  return (
                    <div key={idx} className={className}>
                      <span className="patch-diff-line-number">
                        {lineUrl && (
                          <a href={lineUrl} title={`Open line ${pl.lineNumber} in VSCode`}>
                            {pl.lineNumber}
                          </a>
                        )}
                      </span>
                      <span className="patch-diff-line-content">
                        {pl.type === "addition" || pl.type === "deletion"
                          ? pl.text[0] + " " + pl.text.slice(1)
                          : pl.type === "context"
                            ? " " + pl.text
                            : pl.text || " "}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isComplete && hasError && (
            <div className="patch-tool-section">
              <div className="patch-tool-label">
                <span>Error:</span>
                {executionTime && <span className="patch-tool-time">{executionTime}</span>}
              </div>
              <pre className="patch-tool-error-message">{diff || "Patch failed"}</pre>
            </div>
          )}

          {isRunning && (
            <div className="patch-tool-section">
              <div className="patch-tool-label">Applying patch...</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PatchTool;
