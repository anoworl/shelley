import React, { useState, useEffect, useRef, useCallback } from "react";
import type * as Monaco from "monaco-editor";
import { LLMContent } from "../types";
import { isDarkModeActive } from "../services/theme";
import { buildVSCodeUrl } from "../services/vscode";

// Feature flag for Monaco diff view (set localStorage.setItem('shelley-use-monaco-diff', 'true') to enable)
function useMonacoDiff(): boolean {
  try {
    return localStorage.getItem("shelley-use-monaco-diff") === "true";
  } catch {
    return false;
  }
}

// Display data structure from the patch tool
interface PatchDisplayData {
  path: string;
  oldContent: string;
  newContent: string;
  diff: string;
}

interface PatchToolProps {
  // For tool_use (pending state)
  toolInput?: unknown;
  isRunning?: boolean;

  // For tool_result (completed state)
  toolResult?: LLMContent[];
  hasError?: boolean;
  executionTime?: string;
  display?: unknown; // Display data from the tool_result Content (contains the diff or structured data)
  onCommentTextChange?: (text: string) => void;
}

// Global Monaco instance - loaded lazily
let monacoInstance: typeof Monaco | null = null;
let monacoLoadPromise: Promise<typeof Monaco> | null = null;

function loadMonaco(): Promise<typeof Monaco> {
  if (monacoInstance) {
    return Promise.resolve(monacoInstance);
  }
  if (monacoLoadPromise) {
    return monacoLoadPromise;
  }

  monacoLoadPromise = (async () => {
    // Configure Monaco environment for web workers before importing
    const monacoEnv: Monaco.Environment = {
      getWorkerUrl: () => "/editor.worker.js",
    };
    (self as Window).MonacoEnvironment = monacoEnv;

    // Load Monaco CSS if not already loaded
    if (!document.querySelector('link[href="/monaco-editor.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/monaco-editor.css";
      document.head.appendChild(link);
    }

    // Load Monaco from our local bundle (runtime URL, cast to proper types)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - dynamic runtime URL import
    const monaco = (await import("/monaco-editor.js")) as typeof Monaco;
    monacoInstance = monaco;
    return monacoInstance;
  })();

  return monacoLoadPromise;
}

// Simple diff view component (default)
// Parse unified diff to extract filename and line info
function parseDiff(diffText: string, fallbackPath: string) {
  if (!diffText) return { filename: fallbackPath, parsedLines: [] as { text: string; lineNumber: number | null; type: string }[] };

  const rawLines = diffText.split("\n");
  let filename = fallbackPath;
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
}

function SimpleDiffView({
  displayData,
}: {
  displayData: PatchDisplayData | null;
}) {
  // Get diff text and path from displayData
  const diff = displayData?.diff || "";
  const path = displayData?.path || "";

  const { parsedLines } = parseDiff(diff, path);

  return (
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
                    ? "  " + pl.text
                    : pl.text || " "}
              </span>
            </div>
          );
        })}
      </div>
  );
}

// Monaco diff view component (feature-flagged)
function MonacoDiffView({
  displayData,
  isMobile,
  onCommentTextChange,
  filename,
}: {
  displayData: PatchDisplayData;
  isMobile: boolean;
  onCommentTextChange?: (text: string) => void;
  filename: string;
}) {
  const [monacoLoaded, setMonacoLoaded] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState<{
    line: number;
    selectedText?: string;
  } | null>(null);
  const [commentText, setCommentText] = useState("");

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const hoverDecorationsRef = useRef<string[]>([]);
  const modelsRef = useRef<{
    original: Monaco.editor.ITextModel | null;
    modified: Monaco.editor.ITextModel | null;
  }>({
    original: null,
    modified: null,
  });

  // Load Monaco
  useEffect(() => {
    if (!monacoLoaded) {
      loadMonaco()
        .then((monaco) => {
          monacoRef.current = monaco;
          setMonacoLoaded(true);
        })
        .catch((err) => {
          console.error("Failed to load Monaco:", err);
        });
    }
  }, [monacoLoaded]);

  // Create Monaco editor when data is ready
  useEffect(() => {
    if (!monacoLoaded || !editorContainerRef.current || !monacoRef.current) {
      return;
    }

    const monaco = monacoRef.current;

    // Dispose previous editor and models
    if (editorRef.current) {
      editorRef.current.dispose();
      editorRef.current = null;
    }
    if (modelsRef.current.original) {
      modelsRef.current.original.dispose();
      modelsRef.current.original = null;
    }
    if (modelsRef.current.modified) {
      modelsRef.current.modified.dispose();
      modelsRef.current.modified = null;
    }

    // Get language from file extension
    const ext = "." + (displayData.path.split(".").pop()?.toLowerCase() || "");
    const languages = monaco.languages.getLanguages();
    let language = "plaintext";
    for (const lang of languages) {
      if (lang.extensions?.includes(ext)) {
        language = lang.id;
        break;
      }
    }

    // Create models with unique URIs (include timestamp to avoid conflicts)
    const timestamp = Date.now();
    const originalUri = monaco.Uri.file(`patch-original-${timestamp}-${displayData.path}`);
    const modifiedUri = monaco.Uri.file(`patch-modified-${timestamp}-${displayData.path}`);

    // Check for and dispose any existing models with these URIs (defensive, shouldn't happen)
    const existingOriginal = monaco.editor.getModel(originalUri);
    if (existingOriginal) existingOriginal.dispose();
    const existingModified = monaco.editor.getModel(modifiedUri);
    if (existingModified) existingModified.dispose();

    const originalModel = monaco.editor.createModel(displayData.oldContent, language, originalUri);
    const modifiedModel = monaco.editor.createModel(displayData.newContent, language, modifiedUri);
    modelsRef.current = { original: originalModel, modified: modifiedModel };

    // Create diff editor
    const diffEditor = monaco.editor.createDiffEditor(editorContainerRef.current, {
      theme: isDarkModeActive() ? "vs-dark" : "vs",
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: !isMobile,
      enableSplitViewResizing: true,
      renderIndicators: true,
      renderMarginRevertIcon: false,
      lineNumbers: isMobile ? "off" : "on",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: "on",
      glyphMargin: !isMobile, // Enable glyph margin for comment indicator
      lineDecorationsWidth: isMobile ? 0 : 10,
      lineNumbersMinChars: isMobile ? 0 : 3,
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      lightbulb: { enabled: false },
      codeLens: false,
      contextmenu: false,
      links: false,
      folding: !isMobile,
    });

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    editorRef.current = diffEditor;

    // Add click handler for commenting if callback is provided
    if (onCommentTextChange) {
      const modifiedEditor = diffEditor.getModifiedEditor();

      const openCommentDialog = (lineNumber: number) => {
        const model = modifiedEditor.getModel();
        const selection = modifiedEditor.getSelection();
        let selectedText = "";

        if (selection && !selection.isEmpty() && model) {
          selectedText = model.getValueInRange(selection);
        } else if (model) {
          selectedText = model.getLineContent(lineNumber) || "";
        }

        setShowCommentDialog({
          line: lineNumber,
          selectedText,
        });
      };

      modifiedEditor.onMouseDown((e: Monaco.editor.IEditorMouseEvent) => {
        const isLineClick =
          e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT ||
          e.target.type === monaco.editor.MouseTargetType.CONTENT_EMPTY;

        if (isLineClick) {
          const position = e.target.position;
          if (position) {
            openCommentDialog(position.lineNumber);
          }
        }
      });

      // Add hover highlighting with comment indicator
      let lastHoveredLine = -1;
      modifiedEditor.onMouseMove((e: Monaco.editor.IEditorMouseEvent) => {
        const position = e.target.position;
        const lineNumber = position?.lineNumber ?? -1;

        if (lineNumber === lastHoveredLine) return;
        lastHoveredLine = lineNumber;

        if (lineNumber > 0) {
          hoverDecorationsRef.current = modifiedEditor.deltaDecorations(
            hoverDecorationsRef.current,
            [
              {
                range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                options: {
                  isWholeLine: true,
                  className: "patch-line-hover",
                  glyphMarginClassName: "patch-comment-glyph",
                },
              },
            ],
          );
        } else {
          // Clear decorations when not hovering a line
          hoverDecorationsRef.current = modifiedEditor.deltaDecorations(
            hoverDecorationsRef.current,
            [],
          );
        }
      });

      // Clear decorations when mouse leaves editor
      modifiedEditor.onMouseLeave(() => {
        lastHoveredLine = -1;
        hoverDecorationsRef.current = modifiedEditor.deltaDecorations(
          hoverDecorationsRef.current,
          [],
        );
      });
    }

    // Cleanup function
    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
      if (modelsRef.current.original) {
        modelsRef.current.original.dispose();
        modelsRef.current.original = null;
      }
      if (modelsRef.current.modified) {
        modelsRef.current.modified.dispose();
        modelsRef.current.modified = null;
      }
    };
  }, [monacoLoaded, displayData, isMobile, onCommentTextChange]);

  // Update Monaco theme when dark mode changes
  useEffect(() => {
    if (!monacoRef.current) return;

    const updateMonacoTheme = () => {
      const theme = isDarkModeActive() ? "vs-dark" : "vs";
      monacoRef.current?.editor.setTheme(theme);
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          updateMonacoTheme();
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, [monacoLoaded]);

  // Focus comment input when dialog opens
  useEffect(() => {
    if (showCommentDialog && commentInputRef.current) {
      setTimeout(() => {
        commentInputRef.current?.focus();
      }, 50);
    }
  }, [showCommentDialog]);

  // Handle adding a comment
  const handleAddComment = useCallback(() => {
    if (!showCommentDialog || !commentText.trim() || !onCommentTextChange) return;

    const line = showCommentDialog.line;
    const codeSnippet = showCommentDialog.selectedText?.split("\n")[0]?.trim() || "";
    const truncatedCode =
      codeSnippet.length > 60 ? codeSnippet.substring(0, 57) + "..." : codeSnippet;

    const commentBlock = `> ${filename}:${line}: ${truncatedCode}\n${commentText}\n\n`;

    onCommentTextChange(commentBlock);
    setShowCommentDialog(null);
    setCommentText("");
  }, [showCommentDialog, commentText, onCommentTextChange, filename]);

  // Calculate editor height based on content
  const getEditorHeight = () => {
    const lineCount = Math.max(
      displayData.oldContent.split("\n").length,
      displayData.newContent.split("\n").length,
    );
    // Clamp between 100px and 400px, with 18px per line
    const height = Math.min(400, Math.max(100, lineCount * 18 + 20));
    return `${height}px`;
  };

  return (
    <>
      <div
        ref={editorContainerRef}
        className="patch-tool-monaco-editor"
        style={{ height: getEditorHeight(), width: "100%" }}
      />

      {/* Comment dialog */}
      {showCommentDialog && onCommentTextChange && (
        <div className="patch-tool-comment-dialog">
          <h4>Add Comment (Line {showCommentDialog.line})</h4>
          {showCommentDialog.selectedText && (
            <pre className="patch-tool-selected-text">{showCommentDialog.selectedText}</pre>
          )}
          <textarea
            ref={commentInputRef}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Enter your comment..."
            className="patch-tool-comment-input"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowCommentDialog(null);
              } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                handleAddComment();
              }
            }}
          />
          <div className="patch-tool-comment-actions">
            <button
              onClick={() => setShowCommentDialog(null)}
              className="patch-tool-btn patch-tool-btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleAddComment}
              className="patch-tool-btn patch-tool-btn-primary"
              disabled={!commentText.trim()}
            >
              Add Comment
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function PatchTool({
  toolInput,
  isRunning,
  toolResult,
  hasError,
  executionTime,
  display,
  onCommentTextChange,
}: PatchToolProps) {
  // Default to collapsed for errors (since agents typically recover), expanded otherwise
  const [isExpanded, setIsExpanded] = useState(!hasError);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Check feature flag for Monaco diff view
  const useMonaco = useMonacoDiff();

  // Track viewport size
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  // Parse display data (structured format from backend)
  const displayData: PatchDisplayData | null =
    display &&
    typeof display === "object" &&
    "path" in display &&
    "oldContent" in display &&
    "newContent" in display
      ? (display as PatchDisplayData)
      : null;

  // Extract error message from toolResult if present
  const errorMessage =
    toolResult && toolResult.length > 0 && toolResult[0].Text ? toolResult[0].Text : "";

  const isComplete = !isRunning && toolResult !== undefined;

  // Extract filename from path or diff headers
  const filename = displayData?.path || path || "patch";

  return (
    <div
      className="patch-tool"
      data-testid={isComplete ? "tool-call-completed" : "tool-call-running"}
    >
      <div className="patch-tool-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="patch-tool-summary">
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
          <span className={`patch-tool-emoji ${isRunning ? "running" : ""}`}>🖋️</span>
          <span className="patch-tool-filename">{filename}</span>
        </div>
        <div className="patch-tool-header-right">
          {isComplete && (
            <span className="patch-tool-status">
              {hasError ? (
                <span className="patch-tool-error">✗</span>
              ) : (
                <span className="patch-tool-success">✓</span>
              )}
            </span>
          )}
          {isComplete && executionTime && (
            <span className="patch-tool-time">{executionTime}</span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="patch-tool-details">
          {isComplete && !hasError && displayData && (
            <div className="patch-tool-section">
              {useMonaco ? (
                <MonacoDiffView
                  displayData={displayData}
                  isMobile={isMobile}
                  onCommentTextChange={onCommentTextChange}
                  filename={filename}
                />
              ) : (
                <SimpleDiffView displayData={displayData} />
              )}
            </div>
          )}

          {isComplete && hasError && (
            <div className="patch-tool-section">
              <div className="patch-tool-label">
                <span>Error</span>
              </div>
              <pre className="patch-tool-error-message">{errorMessage || "Patch failed"}</pre>
            </div>
          )}

          {isRunning && (
            <div className="patch-tool-section">
              <div className="patch-tool-label">Applying patch</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PatchTool;
