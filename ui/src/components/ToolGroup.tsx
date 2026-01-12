import React, { useState } from "react";
import { LLMContent, ToolCallData } from "../types";
import BashTool from "./BashTool";
import PatchTool from "./PatchTool";
import ScreenshotTool from "./ScreenshotTool";
import ThinkTool from "./ThinkTool";
import KeywordSearchTool from "./KeywordSearchTool";
import BrowserNavigateTool from "./BrowserNavigateTool";
import BrowserEvalTool from "./BrowserEvalTool";
import ReadImageTool from "./ReadImageTool";
import BrowserConsoleLogsTool from "./BrowserConsoleLogsTool";
import ChangeDirTool from "./ChangeDirTool";
import BrowserResizeTool from "./BrowserResizeTool";
import DeploySelfTool from "./DeploySelfTool";
import GenericTool from "./GenericTool";

interface ToolGroupProps {
  tools: ToolCallData[];
  defaultExpanded?: boolean;
}

// Map tool names to their specialized components
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_COMPONENTS: Record<string, React.ComponentType<any>> = {
  bash: BashTool,
  patch: PatchTool,
  screenshot: ScreenshotTool,
  browser_take_screenshot: ScreenshotTool,
  think: ThinkTool,
  keyword_search: KeywordSearchTool,
  browser_navigate: BrowserNavigateTool,
  browser_eval: BrowserEvalTool,
  read_image: ReadImageTool,
  browser_recent_console_logs: BrowserConsoleLogsTool,
  browser_clear_console_logs: BrowserConsoleLogsTool,
  change_dir: ChangeDirTool,
  browser_resize: BrowserResizeTool,
  deploy_self: DeploySelfTool,
};

function ToolGroup({ tools, defaultExpanded = false }: ToolGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Count tools by name
  const toolCounts: Record<string, number> = {};
  tools.forEach((t) => {
    const name = t.toolName || "unknown";
    toolCounts[name] = (toolCounts[name] || 0) + 1;
  });

  // Calculate total execution time
  let totalMs = 0;
  let allCompleted = true;
  let hasError = false;
  tools.forEach((t) => {
    if (!t.hasResult) allCompleted = false;
    if (t.toolError) hasError = true;
    if (t.toolStartTime && t.toolEndTime) {
      const start = new Date(t.toolStartTime).getTime();
      const end = new Date(t.toolEndTime).getTime();
      totalMs += end - start;
    }
  });

  // Format total time
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Build summary string like "bash(3) patch" (omit count if 1)
  const summaryParts = Object.entries(toolCounts).map(
    ([name, count]) => count > 1 ? `${name}(${count})` : name
  );

  // Status indicators
  const completedCount = tools.filter((t) => t.hasResult).length;
  const errorCount = tools.filter((t) => t.toolError).length;

  const renderTool = (tool: ToolCallData, index: number) => {
    const toolName = tool.toolName || "unknown";
    const ToolComponent = TOOL_COMPONENTS[toolName];

    // Calculate execution time for this tool
    let executionTime = "";
    if (tool.hasResult && tool.toolStartTime && tool.toolEndTime) {
      const start = new Date(tool.toolStartTime).getTime();
      const end = new Date(tool.toolEndTime).getTime();
      const diffMs = end - start;
      executionTime = diffMs < 1000 ? `${diffMs}ms` : `${(diffMs / 1000).toFixed(1)}s`;
    }

    if (ToolComponent) {
      const props = {
        toolInput: tool.toolInput,
        isRunning: !tool.hasResult,
        toolResult: tool.toolResult,
        hasError: tool.toolError,
        executionTime,
        display: tool.display,
        ...(toolName === "browser_recent_console_logs" || toolName === "browser_clear_console_logs"
          ? { toolName }
          : {}),
      };
      return (
        <div key={tool.toolUseId || index} className="tool-group-item">
          <ToolComponent {...props} />
        </div>
      );
    }

    // Fallback to GenericTool
    return (
      <div key={tool.toolUseId || index} className="tool-group-item">
        <GenericTool
          toolName={toolName}
          toolInput={tool.toolInput}
          isRunning={!tool.hasResult}
          toolResult={tool.toolResult}
          hasError={tool.toolError}
          executionTime={executionTime}
        />
      </div>
    );
  };

  // Single tool - render directly without group wrapper
  if (tools.length === 1) {
    return renderTool(tools[0], 0);
  }

  return (
    <div className="message message-tool-group" data-testid="tool-group">
      <div className="message-content">
        <div
          className={`tool-group-header ${expanded ? "expanded" : ""} ${hasError ? "has-error" : ""}`}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="tool-group-header-left">
            <svg
              className={`tool-group-chevron ${expanded ? "expanded" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ width: "1rem", height: "1rem" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ width: "1rem", height: "1rem", color: "var(--blue-text)" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M6 6.87803V6C6 4.75736 7.00736 3.75 8.25 3.75H15.75C16.9926 3.75 18 4.75736 18 6V6.87803M6 6.87803C6.23458 6.79512 6.48702 6.75 6.75 6.75H17.25C17.513 6.75 17.7654 6.79512 18 6.87803M6 6.87803C5.12611 7.18691 4.5 8.02034 4.5 9V9.87803M18 6.87803C18.8739 7.18691 19.5 8.02034 19.5 9V9.87803M19.5 9.87803C19.2654 9.79512 19.013 9.75 18.75 9.75H5.25C4.98702 9.75 4.73458 9.79512 4.5 9.87803M19.5 9.87803C20.3739 10.1869 21 11.0203 21 12V18C21 19.2426 19.9926 20.25 18.75 20.25H5.25C4.00736 20.25 3 19.2426 3 18V12C3 11.0203 3.62611 10.1869 4.5 9.87803"
              />
            </svg>
            <span className="tool-group-count">{tools.length} tool{tools.length > 1 ? "s" : ""}</span>
            <span className="tool-group-summary">{summaryParts.join(" ")}</span>
          </div>
          <div className="tool-group-header-right">
            <span className="tool-group-status">
              {allCompleted ? (
                <>
                  {errorCount > 0 ? (
                    <span className="tool-group-error-count">✗{errorCount}</span>
                  ) : null}
                  <span className="tool-group-success-count">✓{completedCount - errorCount}</span>
                </>
              ) : (
                <span className="tool-group-running">running...</span>
              )}
            </span>
            {allCompleted && totalMs > 0 && (
              <span className="tool-group-time">{formatTime(totalMs)}</span>
            )}
          </div>
        </div>
        {expanded && (
          <div className="tool-group-content">
            {tools.map((tool, index) => renderTool(tool, index))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ToolGroup;
