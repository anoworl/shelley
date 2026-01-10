import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { Virtualizer, VirtualizerHandle } from "virtua";
import { Message, Conversation, StreamResponse, LLMContent } from "../types";
import { api } from "../services/api";
import { ThemeMode, getStoredTheme, setStoredTheme, applyTheme } from "../services/theme";
import { buildVSCodeFolderUrl } from "../services/vscode";
import { VSCodeIcon } from "./icons/VSCodeIcon";
import MessageComponent from "./Message";
import MessageInput from "./MessageInput";
import DiffViewer from "./DiffViewer";
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
import DirectoryPickerModal from "./DirectoryPickerModal";
import { getContextBarColor, formatTokens } from "../utils/context";

interface ContextUsageBarProps {
  contextWindowSize: number;
  maxContextTokens: number;
}

function ContextUsageBar({ contextWindowSize, maxContextTokens }: ContextUsageBarProps) {
  const [showPopup, setShowPopup] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const percentage = maxContextTokens > 0 ? (contextWindowSize / maxContextTokens) * 100 : 0;
  const clampedPercentage = Math.min(percentage, 100);

  const getBarColor = () => getContextBarColor(percentage);

  const handleClick = () => {
    setShowPopup(!showPopup);
  };

  // Close popup when clicking outside
  useEffect(() => {
    if (!showPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setShowPopup(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showPopup]);

  // Calculate fixed position when popup should be shown
  const [popupPosition, setPopupPosition] = useState<{ bottom: number; right: number } | null>(
    null,
  );

  useEffect(() => {
    if (showPopup && barRef.current) {
      const rect = barRef.current.getBoundingClientRect();
      setPopupPosition({
        bottom: window.innerHeight - rect.top + 4,
        right: window.innerWidth - rect.right,
      });
    } else {
      setPopupPosition(null);
    }
  }, [showPopup]);

  return (
    <div ref={barRef}>
      {showPopup && popupPosition && (
        <div
          style={{
            position: "fixed",
            bottom: popupPosition.bottom,
            right: popupPosition.right,
            padding: "6px 10px",
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "4px",
            fontSize: "12px",
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 100,
          }}
        >
          {formatTokens(contextWindowSize)} / {formatTokens(maxContextTokens)} (
          {percentage.toFixed(1)}%) tokens used
        </div>
      )}
      <div
        className="context-usage-bar"
        onClick={handleClick}
        title={`Context: ${formatTokens(contextWindowSize)} / ${formatTokens(maxContextTokens)} tokens (${percentage.toFixed(1)}%)`}
      >
        <div
          className="context-usage-fill"
          style={{
            width: `${clampedPercentage}%`,
            backgroundColor: getBarColor(),
          }}
        />
      </div>
    </div>
  );
}

// Type for processed message items (messages or tool calls)
interface CoalescedItem {
  type: "message" | "tool";
  message?: Message;
  toolUseId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: LLMContent[];
  toolError?: boolean;
  toolStartTime?: string | null;
  toolEndTime?: string | null;
  hasResult?: boolean;
  display?: unknown;
}

interface CoalescedToolCallProps {
  toolName: string;
  toolInput?: unknown;
  toolResult?: LLMContent[];
  toolError?: boolean;
  toolStartTime?: string | null;
  toolEndTime?: string | null;
  hasResult?: boolean;
  display?: unknown;
}

// Map tool names to their specialized components.
// IMPORTANT: When adding a new tool here, also add it to Message.tsx renderContent()
// for both tool_use and tool_result cases. See AGENT.md in this directory.
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

function CoalescedToolCall({
  toolName,
  toolInput,
  toolResult,
  toolError,
  toolStartTime,
  toolEndTime,
  hasResult,
  display,
}: CoalescedToolCallProps) {
  // Calculate execution time if available
  let executionTime = "";
  if (hasResult && toolStartTime && toolEndTime) {
    const start = new Date(toolStartTime).getTime();
    const end = new Date(toolEndTime).getTime();
    const diffMs = end - start;
    if (diffMs < 1000) {
      executionTime = `${diffMs}ms`;
    } else {
      executionTime = `${(diffMs / 1000).toFixed(1)}s`;
    }
  }

  // Look up the specialized component for this tool
  const ToolComponent = TOOL_COMPONENTS[toolName];
  if (ToolComponent) {
    const props = {
      toolInput,
      isRunning: !hasResult,
      toolResult,
      hasError: toolError,
      executionTime,
      display,
      // BrowserConsoleLogsTool needs the toolName prop
      ...(toolName === "browser_recent_console_logs" || toolName === "browser_clear_console_logs"
        ? { toolName }
        : {}),
    };
    return <ToolComponent {...props} />;
  }

  const getToolResultSummary = (results: LLMContent[]) => {
    if (!results || results.length === 0) return "No output";

    const firstResult = results[0];
    if (firstResult.Type === 2 && firstResult.Text) {
      // text content
      const text = firstResult.Text.trim();
      if (text.length <= 50) return text;
      return text.substring(0, 47) + "...";
    }

    return `${results.length} result${results.length > 1 ? "s" : ""}`;
  };

  const renderContent = (content: LLMContent) => {
    if (content.Type === 2) {
      // text
      return <div className="whitespace-pre-wrap break-words">{content.Text || ""}</div>;
    }
    return <div className="text-secondary text-sm italic">[Content type {content.Type}]</div>;
  };

  if (!hasResult) {
    // Show "running" state
    return (
      <div className="message message-tool" data-testid="tool-call-running">
        <div className="message-content">
          <div className="tool-running">
            <div className="tool-running-header">
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ width: "1rem", height: "1rem", color: "var(--blue-text)" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="tool-name">Tool: {toolName}</span>
              <span className="tool-status-running">(running)</span>
            </div>
            <div className="tool-input">
              {typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput, null, 2)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show completed state with result
  const summary = toolResult ? getToolResultSummary(toolResult) : "No output";

  return (
    <div className="message message-tool" data-testid="tool-call-completed">
      <div className="message-content">
        <details className={`tool-result-details ${toolError ? "error" : ""}`}>
          <summary className="tool-result-summary">
            <div className="tool-result-meta">
              <div className="flex items-center space-x-2">
                <svg
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  style={{ width: "1rem", height: "1rem", color: "var(--blue-text)" }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span className="text-sm font-medium text-blue">{toolName}</span>
                <span className={`tool-result-status text-xs ${toolError ? "error" : "success"}`}>
                  {toolError ? "✗" : "✓"} {summary}
                </span>
              </div>
              <div className="tool-result-time">
                {executionTime && <span>{executionTime}</span>}
              </div>
            </div>
          </summary>
          <div className="tool-result-content">
            {/* Show tool input */}
            <div className="tool-result-section">
              <div className="tool-result-label">Input:</div>
              <div className="tool-result-data">
                {toolInput ? (
                  typeof toolInput === "string" ? (
                    toolInput
                  ) : (
                    JSON.stringify(toolInput, null, 2)
                  )
                ) : (
                  <span className="text-secondary italic">No input data</span>
                )}
              </div>
            </div>

            {/* Show tool output with header */}
            <div className={`tool-result-section output ${toolError ? "error" : ""}`}>
              <div className="tool-result-label">Output{toolError ? " (Error)" : ""}:</div>
              <div className="space-y-2">
                {toolResult?.map((result, idx) => (
                  <div key={idx}>{renderContent(result)}</div>
                ))}
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

// Animated "Agent working..." with letter-by-letter bold animation
function AnimatedWorkingStatus() {
  const text = "Agent working...";
  const [boldIndex, setBoldIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setBoldIndex((prev) => (prev + 1) % text.length);
    }, 100); // 100ms per letter
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="status-message animated-working">
      {text.split("").map((char, idx) => (
        <span key={idx} className={idx === boldIndex ? "bold-letter" : ""}>
          {char}
        </span>
      ))}
    </span>
  );
}

interface ChatInterfaceProps {
  conversationId: string | null;
  onOpenDrawer: () => void;
  onNewConversation: () => void;
  currentConversation?: Conversation;
  onConversationUpdate?: (conversation: Conversation) => void;
  onFirstMessage?: (message: string, model: string, cwd?: string) => Promise<void>;
  mostRecentCwd?: string | null;
}

function ChatInterface({
  conversationId,
  onOpenDrawer,
  onNewConversation,
  currentConversation,
  onConversationUpdate,
  onFirstMessage,
  mostRecentCwd,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const models = window.__SHELLEY_INIT__?.models || [];
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    // First check localStorage for a sticky model preference
    const storedModel = localStorage.getItem("shelley_selected_model");
    const initModels = window.__SHELLEY_INIT__?.models || [];
    // Validate that the stored model exists and is ready
    if (storedModel) {
      const modelInfo = initModels.find((m) => m.id === storedModel);
      if (modelInfo?.ready) {
        return storedModel;
      }
    }
    // Fall back to server default or first ready model
    const defaultModel = window.__SHELLEY_INIT__?.default_model;
    if (defaultModel) {
      return defaultModel;
    }
    const firstReady = initModels.find((m) => m.ready);
    return firstReady?.id || "claude-sonnet-4.5";
  });
  // Wrapper to persist model selection to localStorage
  const setSelectedModel = (model: string) => {
    setSelectedModelState(model);
    localStorage.setItem("shelley_selected_model", model);
  };
  const [selectedCwd, setSelectedCwdState] = useState<string>("");
  const [cwdInitialized, setCwdInitialized] = useState(false);
  // Wrapper to persist cwd selection to localStorage
  const setSelectedCwd = (cwd: string) => {
    setSelectedCwdState(cwd);
    localStorage.setItem("shelley_selected_cwd", cwd);
  };

  // Initialize CWD with priority: localStorage > mostRecentCwd > server default
  useEffect(() => {
    if (cwdInitialized) return;

    // First check localStorage for a sticky cwd preference
    const storedCwd = localStorage.getItem("shelley_selected_cwd");
    if (storedCwd) {
      setSelectedCwdState(storedCwd);
      setCwdInitialized(true);
      return;
    }

    // Use most recent conversation's CWD if available
    if (mostRecentCwd) {
      setSelectedCwdState(mostRecentCwd);
      setCwdInitialized(true);
      return;
    }

    // Fall back to server default
    const defaultCwd = window.__SHELLEY_INIT__?.default_cwd || "";
    if (defaultCwd) {
      setSelectedCwdState(defaultCwd);
      setCwdInitialized(true);
    }
  }, [mostRecentCwd, cwdInitialized]);
  const [cwdError, setCwdError] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState(false);
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);
  // Settings modal removed - configuration moved to status bar for empty conversations
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredTheme);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [diffViewerInitialCommit, setDiffViewerInitialCommit] = useState<string | undefined>(
    undefined,
  );
  const [diffCommentText, setDiffCommentText] = useState("");
  const [agentWorking, setAgentWorking] = useState(false);
  const [mobileInputVisible, setMobileInputVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [contextWindowSize, setContextWindowSize] = useState(0);
  const terminalURL = window.__SHELLEY_INIT__?.terminal_url || null;
  const links = window.__SHELLEY_INIT__?.links || [];
  const hostname = window.__SHELLEY_INIT__?.hostname || "localhost";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const initialAssetHashRef = useRef<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const virtualizerRef = useRef<VirtualizerHandle>(null);
  const shouldStickToBottom = useRef(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Load messages and set up streaming
  useEffect(() => {
    if (conversationId) {
      setAgentWorking(false);
      loadMessages();
      setupMessageStream();
    } else {
      // No conversation yet, show empty state
      setMessages([]);
      setContextWindowSize(0);
      setLoading(false);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [conversationId]);

  // Scroll handling is now done by Virtualizer's onScroll callback

  // Close overflow menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(event.target as Node)) {
        setShowOverflowMenu(false);
      }
    };

    if (showOverflowMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showOverflowMenu]);

  const loadMessages = async () => {
    if (!conversationId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await api.getConversation(conversationId);
      setMessages(response.messages ?? []);
      setAgentWorking(Boolean(response.agent_working));
      // Always update context window size when loading a conversation.
      // If omitted from response (due to omitempty when 0), default to 0.
      setContextWindowSize(response.context_window_size ?? 0);
      if (onConversationUpdate) {
        onConversationUpdate(response.conversation);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
      setError("Failed to load messages");
    } finally {
      // Always set loading to false, even if other operations fail
      setLoading(false);
    }
  };

  const setupMessageStream = () => {
    if (!conversationId) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = api.createMessageStream(conversationId);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const streamResponse: StreamResponse = JSON.parse(event.data);
        const incomingMessages = Array.isArray(streamResponse.messages)
          ? streamResponse.messages
          : [];

        // Track asset hash for detecting server restarts with new code
        if (streamResponse.asset_hash) {
          if (initialAssetHashRef.current === null) {
            // First time seeing asset hash, store it
            initialAssetHashRef.current = streamResponse.asset_hash;
          } else if (initialAssetHashRef.current !== streamResponse.asset_hash) {
            // Asset hash changed, server was restarted with new code
            window.location.reload();
            return;
          }
        }

        // Merge new messages without losing existing ones.
        // If no new messages (e.g., only conversation/slug update), keep existing list.
        if (incomingMessages.length > 0) {
          setMessages((prev) => {
            const byId = new Map<string, Message>();
            for (const m of prev) byId.set(m.message_id, m);
            for (const m of incomingMessages) byId.set(m.message_id, m);
            // Preserve original order, then append truly new ones in the order received
            const result: Message[] = [];
            for (const m of prev) result.push(byId.get(m.message_id)!);
            for (const m of incomingMessages) {
              if (!prev.find((p) => p.message_id === m.message_id)) result.push(m);
            }
            return result;
          });
        }

        // Update conversation data if provided
        if (onConversationUpdate) {
          onConversationUpdate(streamResponse.conversation);
        }

        if (typeof streamResponse.agent_working === "boolean") {
          setAgentWorking(streamResponse.agent_working);
        }

        if (typeof streamResponse.context_window_size === "number") {
          setContextWindowSize(streamResponse.context_window_size);
        }
      } catch (err) {
        console.error("Failed to parse message stream data:", err);
      }
    };

    eventSource.onerror = (event) => {
      console.warn("Message stream error (will retry):", event);
      // Close and retry after a delay
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Backoff delays: 1s, 5s, 10s, then give up
      const delays = [1000, 5000, 10000];

      setReconnectAttempts((prev) => {
        const attempts = prev + 1;

        if (attempts > delays.length) {
          // Give up and show disconnected UI
          setIsDisconnected(true);
          return attempts;
        }

        const delay = delays[attempts - 1];
        console.log(`Reconnecting in ${delay}ms (attempt ${attempts}/${delays.length})`);

        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (eventSourceRef.current === null) {
            setupMessageStream();
          }
        }, delay);

        return attempts;
      });
    };

    eventSource.onopen = () => {
      console.log("Message stream connected");
      // Reset reconnect attempts on successful connection
      setReconnectAttempts(0);
      setIsDisconnected(false);
    };
  };

  const sendMessage = async (message: string) => {
    if (!message.trim() || sending) return;

    try {
      setSending(true);
      setError(null);
      setAgentWorking(true);

      // If no conversation ID, this is the first message - validate cwd first
      if (!conversationId && onFirstMessage) {
        // Validate cwd if provided
        if (selectedCwd) {
          const validation = await api.validateCwd(selectedCwd);
          if (!validation.valid) {
            throw new Error(`Invalid working directory: ${validation.error}`);
          }
        }
        await onFirstMessage(message.trim(), selectedModel, selectedCwd || undefined);
      } else if (conversationId) {
        await api.sendMessage(conversationId, {
          message: message.trim(),
          model: selectedModel,
        });
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setAgentWorking(false);
      throw err; // Re-throw so MessageInput can preserve the text
    } finally {
      setSending(false);
    }
  };

  // scrollToBottom is defined after coalescedItems

  const handleManualReconnect = () => {
    setIsDisconnected(false);
    setReconnectAttempts(0);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setupMessageStream();
  };

  const handleCancel = async () => {
    if (!conversationId || cancelling) return;

    try {
      setCancelling(true);
      await api.cancelConversation(conversationId);
      setAgentWorking(false);
    } catch (err) {
      console.error("Failed to cancel conversation:", err);
      setError("Failed to cancel. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const getDisplayTitle = () => {
    return currentConversation?.slug || "Shelley";
  };

  // Process messages to coalesce tool calls (memoized for Virtualizer)
  const coalescedItems = useMemo(() => {
    if (messages.length === 0) {
      return [];
    }

    const items: CoalescedItem[] = [];
    const toolResultMap: Record<
      string,
      {
        result: LLMContent[];
        error: boolean;
        startTime: string | null;
        endTime: string | null;
      }
    > = {};
    // Some tool results may be delivered only as display_data (e.g., screenshots)
    const displayResultSet: Set<string> = new Set();
    const displayDataMap: Record<string, unknown> = {};

    // First pass: collect all tool results
    messages.forEach((message) => {
      // Collect tool_result data from llm_data if present
      if (message.llm_data) {
        try {
          const llmData =
            typeof message.llm_data === "string" ? JSON.parse(message.llm_data) : message.llm_data;
          if (llmData && llmData.Content && Array.isArray(llmData.Content)) {
            llmData.Content.forEach((content: LLMContent) => {
              if (content && content.Type === 6 && content.ToolUseID) {
                // tool_result
                toolResultMap[content.ToolUseID] = {
                  result: content.ToolResult || [],
                  error: content.ToolError || false,
                  startTime: content.ToolUseStartTime || null,
                  endTime: content.ToolUseEndTime || null,
                };
              }
            });
          }
        } catch (err) {
          console.error("Failed to parse message LLM data for tool results:", err);
        }
      }

      // Also collect tool_use_ids from display_data to mark completion even if llm_data is omitted
      if (message.display_data) {
        try {
          const displays =
            typeof message.display_data === "string"
              ? JSON.parse(message.display_data)
              : message.display_data;
          if (Array.isArray(displays)) {
            for (const d of displays) {
              if (
                d &&
                typeof d === "object" &&
                "tool_use_id" in d &&
                typeof d.tool_use_id === "string"
              ) {
                displayResultSet.add(d.tool_use_id);
                // Store the display data for this tool use
                if ("display" in d) {
                  displayDataMap[d.tool_use_id] = d.display;
                }
              }
            }
          }
        } catch (err) {
          console.error("Failed to parse display_data for tool completion:", err);
        }
      }
    });

    // Second pass: process messages and extract tool uses
    messages.forEach((message) => {
      // Skip system messages
      if (message.type === "system") {
        return;
      }

      if (message.type === "error") {
        items.push({ type: "message", message });
        return;
      }

      // Check if this is a user message with tool results (skip rendering them as messages)
      let hasToolResult = false;
      if (message.llm_data) {
        try {
          const llmData =
            typeof message.llm_data === "string" ? JSON.parse(message.llm_data) : message.llm_data;
          if (llmData && llmData.Content && Array.isArray(llmData.Content)) {
            hasToolResult = llmData.Content.some((c: LLMContent) => c.Type === 6);
          }
        } catch (err) {
          console.error("Failed to parse message LLM data:", err);
        }
      }

      // If it's a user message without tool results, show it
      if (message.type === "user" && !hasToolResult) {
        items.push({ type: "message", message });
        return;
      }

      // If it's a user message with tool results, skip it (we'll handle it via the toolResultMap)
      if (message.type === "user" && hasToolResult) {
        return;
      }

      if (message.llm_data) {
        try {
          const llmData =
            typeof message.llm_data === "string" ? JSON.parse(message.llm_data) : message.llm_data;
          if (llmData && llmData.Content && Array.isArray(llmData.Content)) {
            // Extract text content and tool uses separately
            const textContents: LLMContent[] = [];
            const toolUses: LLMContent[] = [];

            llmData.Content.forEach((content: LLMContent) => {
              if (content.Type === 2) {
                // text
                textContents.push(content);
              } else if (content.Type === 5) {
                // tool_use
                toolUses.push(content);
              }
            });

            // If we have text content, add it as a message (but only if it's not empty)
            const textString = textContents
              .map((c) => c.Text || "")
              .join("")
              .trim();
            if (textString) {
              items.push({ type: "message", message });
            }

            // Add tool uses as separate items
            toolUses.forEach((toolUse) => {
              const resultData = toolUse.ID ? toolResultMap[toolUse.ID] : undefined;
              const completedViaDisplay = toolUse.ID ? displayResultSet.has(toolUse.ID) : false;
              const displayData = toolUse.ID ? displayDataMap[toolUse.ID] : undefined;
              items.push({
                type: "tool",
                toolUseId: toolUse.ID,
                toolName: toolUse.ToolName,
                toolInput: toolUse.ToolInput,
                toolResult: resultData?.result,
                toolError: resultData?.error,
                toolStartTime: resultData?.startTime,
                toolEndTime: resultData?.endTime,
                hasResult: !!resultData || completedViaDisplay,
                display: displayData,
              });
            });
          }
        } catch (err) {
          console.error("Failed to parse message LLM data:", err);
          items.push({ type: "message", message });
        }
      } else {
        items.push({ type: "message", message });
      }
    });

    return items;
  }, [messages]);

  // Scroll to bottom - must be after coalescedItems is defined
  const scrollToBottom = useCallback(() => {
    if (virtualizerRef.current && coalescedItems.length > 0) {
      shouldStickToBottom.current = true;
      virtualizerRef.current.scrollToIndex(coalescedItems.length - 1, { align: "end" });
    }
    setShowScrollToBottom(false);
  }, [coalescedItems.length]);

  // Auto-scroll to bottom when messages change (if user is at bottom)
  useLayoutEffect(() => {
    if (!virtualizerRef.current || coalescedItems.length === 0) return;
    if (shouldStickToBottom.current) {
      virtualizerRef.current.scrollToIndex(coalescedItems.length - 1, { align: "end" });
    }
  }, [coalescedItems]);

  // Render a single item for Virtualizer
  const renderItem = useCallback(
    (index: number, item: CoalescedItem) => {
      if (item.type === "message" && item.message) {
        return (
          <MessageComponent
            message={item.message}
            onOpenDiffViewer={(commit) => {
              setDiffViewerInitialCommit(commit);
              setShowDiffViewer(true);
            }}
          />
        );
      } else if (item.type === "tool") {
        return (
          <CoalescedToolCall
            toolName={item.toolName || "Unknown Tool"}
            toolInput={item.toolInput}
            toolResult={item.toolResult}
            toolError={item.toolError}
            toolStartTime={item.toolStartTime}
            toolEndTime={item.toolEndTime}
            hasResult={item.hasResult}
            display={item.display}
          />
        );
      }
      return null;
    },
    []
  );

  // Compute item key for Virtualizer
  const computeItemKey = useCallback(
    (index: number, item: CoalescedItem) => {
      if (item.type === "message" && item.message) {
        return item.message.message_id;
      } else if (item.type === "tool" && item.toolUseId) {
        return item.toolUseId;
      }
      return `item-${index}`;
    },
    []
  );



  return (
    <div className="full-height flex flex-col">
      {/* Header */}
      <div className="header">
        <div className="header-left">
          <button
            onClick={onOpenDrawer}
            className="btn-icon hide-on-desktop"
            aria-label="Open conversations"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <h1 className="header-title" title={currentConversation?.slug || "Shelley"}>
            {getDisplayTitle()}
          </h1>
        </div>

        <div className="header-actions">
          {/* VSCode open button */}
          {buildVSCodeFolderUrl(currentConversation?.cwd || selectedCwd) && (
            <a
              href={buildVSCodeFolderUrl(currentConversation?.cwd || selectedCwd)!}
              className="btn-vscode"
              aria-label="Open in VSCode"
              title="Open in VSCode"
            >
              <VSCodeIcon size="0.875rem" />
            </a>
          )}

          {/* Green + icon in circle for new conversation */}
          <button onClick={onNewConversation} className="btn-new" aria-label="New conversation">
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ width: "1rem", height: "1rem" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>

          {/* Overflow menu */}
          <div ref={overflowMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowOverflowMenu(!showOverflowMenu)}
              className="btn-icon"
              aria-label="More options"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>

            {showOverflowMenu && (
              <div className="overflow-menu">
                {/* Diffs button - show when we have a CWD */}
                {(currentConversation?.cwd || selectedCwd) && (
                  <button
                    onClick={() => {
                      setShowOverflowMenu(false);
                      setShowDiffViewer(true);
                    }}
                    className="overflow-menu-item"
                  >
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.75rem" }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Diffs
                  </button>
                )}
                {terminalURL && (
                  <button
                    onClick={() => {
                      setShowOverflowMenu(false);
                      window.open(terminalURL, "_blank");
                    }}
                    className="overflow-menu-item"
                  >
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.75rem" }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    Terminal
                  </button>
                )}
                {links.map((link, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setShowOverflowMenu(false);
                      window.open(link.url, "_blank");
                    }}
                    className="overflow-menu-item"
                  >
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.75rem" }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={
                          link.icon_svg ||
                          "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        }
                      />
                    </svg>
                    {link.title}
                  </button>
                ))}

                {/* Theme selector */}
                <div className="overflow-menu-divider" />
                <div className="theme-toggle-row">
                  <button
                    onClick={() => {
                      setThemeMode("system");
                      setStoredTheme("system");
                      applyTheme("system");
                    }}
                    className={`theme-toggle-btn${themeMode === "system" ? " theme-toggle-btn-selected" : ""}`}
                    title="System"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      setThemeMode("light");
                      setStoredTheme("light");
                      applyTheme("light");
                    }}
                    className={`theme-toggle-btn${themeMode === "light" ? " theme-toggle-btn-selected" : ""}`}
                    title="Light"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      setThemeMode("dark");
                      setStoredTheme("dark");
                      applyTheme("dark");
                    }}
                    className={`theme-toggle-btn${themeMode === "dark" ? " theme-toggle-btn-selected" : ""}`}
                    title="Dark"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages area */}
      {/* Messages area with scroll-to-bottom button wrapper */}
      <div className="messages-area-wrapper">
        {loading ? (
          <div className="messages-container flex items-center justify-center full-height">
            <div className="spinner"></div>
          </div>
        ) : (
          <div
            className="messages-container"
            style={{
              overflowY: "auto",
              overflowAnchor: "none",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ flexGrow: 1 }} />
            <Virtualizer
              ref={virtualizerRef}
              onScroll={(offset) => {
                if (!virtualizerRef.current) return;
                const atBottom =
                  offset - virtualizerRef.current.scrollSize + virtualizerRef.current.viewportSize >= -1.5;
                shouldStickToBottom.current = atBottom;
                setShowScrollToBottom(!atBottom);
              }}
            >
              {coalescedItems.map((item, index) => (
                <div key={computeItemKey(index, item)}>
                  {renderItem(index, item)}
                </div>
              ))}
            </Virtualizer>
          </div>
        )}

        {/* Scroll to bottom button - outside scrollable area */}
        {showScrollToBottom && (
          <button
            className="scroll-to-bottom-button"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
          >
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ width: "1.25rem", height: "1.25rem" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Unified Status Bar */}
      <div className="status-bar">
        <div className="status-bar-content">
          {isDisconnected ? (
            // Disconnected state
            <>
              <span className="status-message status-warning">Disconnected</span>
              <button
                onClick={handleManualReconnect}
                className="status-button status-button-primary"
              >
                Retry
              </button>
            </>
          ) : error ? (
            // Error state
            <>
              <span className="status-message status-error">{error}</span>
              <button onClick={() => setError(null)} className="status-button status-button-text">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </>
          ) : agentWorking && conversationId ? (
            // Agent working - show status with stop button and context bar
            <div className="status-bar-active">
              <div className="status-working-group">
                <AnimatedWorkingStatus />
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="status-stop-button"
                  title={cancelling ? "Cancelling..." : "Stop"}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  <span className="status-stop-label">{cancelling ? "Cancelling..." : "Stop"}</span>
                </button>
              </div>
              <ContextUsageBar
                contextWindowSize={contextWindowSize}
                maxContextTokens={
                  models.find((m) => m.id === selectedModel)?.max_context_tokens || 200000
                }
              />
            </div>
          ) : // Idle state - show ready message, or configuration for empty conversation
          !conversationId ? (
            // Empty conversation - show model (left) and cwd (right)
            <div
              className="status-bar-new-conversation status-bar-clickable"
              onClick={(e) => {
                // Only trigger if clicking the background, not the buttons
                if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.status-field')) {
                  if (!(e.target as HTMLElement).closest('button') && !(e.target as HTMLElement).closest('select')) {
                    setMobileInputVisible(true);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (!(e.target as HTMLElement).closest('button') && !(e.target as HTMLElement).closest('select')) {
                    e.preventDefault();
                    setMobileInputVisible(true);
                  }
                }
              }}
              role="button"
              tabIndex={0}
            >
              {/* Model selector - far left */}
              <div
                className="status-field status-field-model"
                title="AI model to use for this conversation"
              >
                <span className="status-field-label">Model:</span>
                {editingModel ? (
                  <select
                    id="model-select-status"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    onBlur={() => setEditingModel(false)}
                    disabled={sending}
                    className="status-select"
                    autoFocus
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id} disabled={!model.ready}>
                        {model.id} {!model.ready ? "(not ready)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    className="status-chip"
                    onClick={() => setEditingModel(true)}
                    disabled={sending}
                  >
                    {selectedModel}
                  </button>
                )}
              </div>

              {/* CWD indicator - far right */}
              <div
                className={`status-field status-field-cwd${cwdError ? " status-field-error" : ""}`}
                title={cwdError || "Working directory for file operations"}
              >
                <span className="status-field-label">Dir:</span>
                <button
                  className={`status-chip${cwdError ? " status-chip-error" : ""}`}
                  onClick={() => setShowDirectoryPicker(true)}
                  disabled={sending}
                >
                  {selectedCwd || "(no cwd)"}
                </button>
              </div>
            </div>
          ) : (
            // Active conversation - show Ready + context bar
            <div
              className="status-bar-active status-bar-clickable"
              onClick={() => setMobileInputVisible(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMobileInputVisible(true);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <span className="status-message status-ready">
                Ready on {window.matchMedia('(max-width: 768px)').matches ? hostname.split('.')[0] : hostname}
              </span>
              <ContextUsageBar
                contextWindowSize={contextWindowSize}
                maxContextTokens={
                  models.find((m) => m.id === selectedModel)?.max_context_tokens || 200000
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Message input - hidden on mobile until status bar is tapped */}
      <MessageInput
        key={conversationId || "new"}
        onSend={async (msg) => {
          await sendMessage(msg);
          // Hide input on mobile after sending
          if (window.matchMedia("(max-width: 768px)").matches) {
            setMobileInputVisible(false);
          }
        }}
        disabled={sending || loading}
        autoFocus={mobileInputVisible}
        injectedText={diffCommentText}
        onClearInjectedText={() => setDiffCommentText("")}
        persistKey={conversationId || "new-conversation"}
        mobileVisible={mobileInputVisible}
        onMobileBlur={() => setMobileInputVisible(false)}
      />

      {/* Directory Picker Modal */}
      <DirectoryPickerModal
        isOpen={showDirectoryPicker}
        onClose={() => setShowDirectoryPicker(false)}
        onSelect={(path) => {
          setSelectedCwd(path);
          setCwdError(null);
        }}
        initialPath={selectedCwd}
      />

      {/* Diff Viewer */}
      <DiffViewer
        cwd={currentConversation?.cwd || selectedCwd}
        isOpen={showDiffViewer}
        onClose={() => {
          setShowDiffViewer(false);
          setDiffViewerInitialCommit(undefined);
        }}
        onCommentTextChange={setDiffCommentText}
        initialCommit={diffViewerInitialCommit}
      />
    </div>
  );
}

export default ChatInterface;
