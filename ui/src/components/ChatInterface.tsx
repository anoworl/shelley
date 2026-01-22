import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { Virtualizer, VirtualizerHandle } from "virtua";
import { Message, Conversation, StreamResponse, LLMContent, ToolCallData, MessageSegment } from "../types";
import { api } from "../services/api";

import { buildVSCodeFolderUrl } from "../services/vscode";
import { VSCodeIcon } from "./icons/VSCodeIcon";
import MessageComponent from "./Message";
import MessageInput from "./MessageInput";
import { InputModal } from "./InputModal";
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
import ToolGroup from "./ToolGroup";
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

// Type for processed message items (messages, tool calls, or tool groups)
// Intermediate item type used during coalescence
interface IntermediateItem {
  type: "message" | "tool";
  message?: Message;
  // For tool items
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

// Final coalesced item: message with optional following tools
interface CoalescedItem {
  type: "message";
  message: Message;
  // Tools that follow this message (merged into the message)
  followingTools?: ToolCallData[];
  // When showTools=false, consecutive LLM messages are merged into segments
  mergedSegments?: MessageSegment[];
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
  onCommentTextChange?: (text: string) => void;
}

// Map tool names to their specialized components.
// IMPORTANT: When adding a new tool here, also add it to Message.tsx renderContent()
// for both tool_use and tool_result cases. See AGENTS.md in this directory.
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
  onCommentTextChange,
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
      // Patch tool can add comments
      ...(toolName === "patch" && onCommentTextChange ? { onCommentTextChange } : {}),
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
  onConversationArchived?: (conversationId: string) => void;
  onFirstMessage?: (message: string, model: string, cwd?: string) => Promise<void>;
  mostRecentCwd?: string | null;
  compact?: boolean;
  isFocused?: boolean;
  isMaximized?: boolean;
  onRestoreFromMaximized?: () => void;
  showPaneControls?: boolean;
  onMaximize?: () => void;
  onClose?: () => void;
}

function ChatInterface({
  conversationId,
  onOpenDrawer,
  onNewConversation,
  currentConversation,
  onConversationUpdate,
  onConversationArchived,
  onFirstMessage,
  mostRecentCwd,
  compact = false,
  isFocused = true,
  isMaximized = false,
  onRestoreFromMaximized,
  showPaneControls = false,
  onMaximize,
  onClose,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingUserMessage, setPendingUserMessage] = useState<Message | null>(null);
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

  // When opening a new conversation pane, use mostRecentCwd (inherits from focused conversation)
  useEffect(() => {
    if (conversationId === null && mostRecentCwd) {
      setSelectedCwdState(mostRecentCwd);
    }
  }, [conversationId, mostRecentCwd]);

  const [cwdError, setCwdError] = useState<string | null>(null);

  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [indicatorMode, setIndicatorMode] = useState<"inline" | "block" | "hidden">("inline");
  const [expansionBehavior, setExpansionBehavior] = useState<"single" | "all">("single");
  const [enterBehavior, setEnterBehavior] = useState<"send" | "stop_and_send">("send");
  const [diffViewerInitialCommit, setDiffViewerInitialCommit] = useState<string | undefined>(
    undefined,
  );
  const [diffCommentText, setDiffCommentText] = useState("");
  const [agentWorking, setAgentWorking] = useState(false);
  const [mobileInputVisible, setMobileInputVisible] = useState(false);
  
  // Close modal when focus changes to another pane
  useEffect(() => {
    if (compact && !isFocused) {
      setMobileInputVisible(false);
    }
  }, [isFocused, compact]);

  // Open input modal with Enter key when focused in compact mode
  useEffect(() => {
    if (!compact || !isFocused) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if already in input or modal is open
      if (mobileInputVisible) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"]')) return;
      
      if ((e.key === 'Enter' || e.key === ' ') && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setMobileInputVisible(true);
      }
      
      // j/k for scrolling (vim-style)
      if ((e.key === 'j' || e.key === 'k') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (virtualizerRef.current) {
          const scrollAmount = 100; // pixels
          virtualizerRef.current.scrollBy(e.key === 'j' ? scrollAmount : -scrollAmount);
        }
      }
      
      // n for new conversation
      if (e.key === 'n' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onNewConversation();
      }
      
      // q for close pane
      if (e.key === 'q' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onClose?.();
      }
      
      // G for scroll to bottom
      if (e.key === 'G' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (virtualizerRef.current) {
          virtualizerRef.current.scrollTo(virtualizerRef.current.scrollSize);
        }
      }
      
      // gg for scroll to top (track 'g' press)
      if (e.key === 'g' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now();
        if (lastGPress.current && now - lastGPress.current < 500) {
          e.preventDefault();
          if (virtualizerRef.current) {
            virtualizerRef.current.scrollTo(0);
          }
          lastGPress.current = null;
        } else {
          lastGPress.current = now;
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [compact, isFocused, mobileInputVisible, onNewConversation, onClose]);
  
  // Double-tap handler for compact mode
  const handleMessagesAreaClick = (e: React.MouseEvent) => {
    if (!compact) return;
    // Don't trigger on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button, a, select, input, textarea, [role="button"]')) return;
    
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      // Double tap detected
      setMobileInputVisible(true);
      lastTapTime.current = 0;
    } else {
      lastTapTime.current = now;
    }
  };
  
  const [cancelling, setCancelling] = useState(false);
  const [contextWindowSize, setContextWindowSize] = useState(0);
  const hostname = window.__SHELLEY_INIT__?.hostname || "localhost";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const initialAssetHashRef = useRef<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [showTools, setShowTools] = useState<boolean>(() => {
    const stored = localStorage.getItem("shelley-show-tools");
    return stored === null ? true : stored === "true";
  });
  const [showCopied, setShowCopied] = useState(false);
  const virtualizerRef = useRef<VirtualizerHandle>(null);
  const shouldStickToBottom = useRef(true);
  const lastGPress = useRef<number | null>(null);
  const lastTapTime = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Load settings on mount and when settings modal closes
  const loadSettings = async () => {
    try {
      const settings = await api.getSettings();
      setIndicatorMode(settings.ui?.indicatorMode ?? "inline");
      setExpansionBehavior(settings.ui?.expansionBehavior ?? "single");
      setEnterBehavior(settings.ui?.enterBehavior ?? "send");
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  useEffect(() => {
    loadSettings();
    // Reload settings when they change (e.g., from SettingsModal)
    const handleSettingsChanged = () => loadSettings();
    window.addEventListener("shelley-settings-changed", handleSettingsChanged);
    return () => window.removeEventListener("shelley-settings-changed", handleSettingsChanged);
  }, []);

  // Load messages and set up streaming
  useEffect(() => {
    // Clear pending user message when conversation changes
    setPendingUserMessage(null);

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
      // Sync model selection with conversation's model
      if (response.conversation.model_id) {
        setSelectedModelState(response.conversation.model_id);
      }
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
          // Clear pending user message if we received a user message from the server
          const hasUserMessage = incomingMessages.some((m) => m.type === "user");
          if (hasUserMessage) {
            setPendingUserMessage(null);
          }

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

        // Only update context window size if provided and non-zero
        // (gitinfo messages don't include context_window_size)
        if (typeof streamResponse.context_window_size === "number" && streamResponse.context_window_size > 0) {
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
      // Sync agent_working and model_id state after reconnect
      // Don't call loadMessages() here - it would race with SSE messages
      // and potentially overwrite newer messages with an older snapshot
      if (conversationId) {
        api.getConversation(conversationId).then((response) => {
          setAgentWorking(Boolean(response.agent_working));
          if (response.conversation.model_id) {
            setSelectedModelState(response.conversation.model_id);
          }
        });
      }
    };
  };

  const sendMessage = async (message: string) => {
    if (!message.trim()) return;
    if (sending) {
      throw new Error("Already sending");
    }

    // Auto-reconnect SSE if disconnected
    if (isDisconnected) {
      handleManualReconnect();
    }

    // Optimistic update: immediately show user message
    const optimisticMessage: Message = {
      message_id: `pending-${Date.now()}`,
      conversation_id: conversationId || "",
      sequence_id: -1, // Placeholder for optimistic message
      type: "user",
      user_data: null,
      llm_data: JSON.stringify({
        Role: 0, // user
        Content: [{ Type: 2, Text: message.trim() }],
      }),
      display_data: null,
      created_at: new Date().toISOString(),
    };
    setPendingUserMessage(optimisticMessage);
    shouldStickToBottom.current = true; // Re-enable auto-scroll when sending

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
      setPendingUserMessage(null); // Clear optimistic message on error
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
      throw err; // Re-throw so callers know cancel failed
    } finally {
      setCancelling(false);
    }
  };

  const getDisplayTitle = () => {
    return currentConversation?.slug || "Shelley";
  };

  // Quick reply shortcuts (y for yes, c for continue, s for stop)
  useEffect(() => {
    if (!compact || !isFocused) return;
    
    const handleQuickReply = async (e: KeyboardEvent) => {
      // Don't trigger if in input or modal is open
      if (mobileInputVisible) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      // Helper to send message, respecting enterBehavior setting
      const sendQuickMessage = async (msg: string) => {
        // If agent is working, check enterBehavior setting
        if (agentWorking) {
          if (enterBehavior === 'stop_and_send') {
            await handleCancel();
            await sendMessage(msg);
          }
          // If enterBehavior is 'send', do nothing while agent is working
          return;
        }
        await sendMessage(msg);
      };
      
      // s for stop (only when agent is working)
      if (e.key === 's' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (agentWorking) {
          e.preventDefault();
          handleCancel();
        }
      }
      
      // y for sending "yes"
      if (e.key === 'y' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        sendQuickMessage('yes');
      }
      
      // c for sending "continue"
      if (e.key === 'c' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        sendQuickMessage('continue');
      }
    };
    
    window.addEventListener('keydown', handleQuickReply);
    return () => window.removeEventListener('keydown', handleQuickReply);
  }, [compact, isFocused, mobileInputVisible, sendMessage, agentWorking, enterBehavior, handleCancel]);

  // Process messages to coalesce tool calls (memoized for Virtualizer)
  const coalescedItems = useMemo(() => {
    // Include pending user message if present
    const allMessages = pendingUserMessage ? [...messages, pendingUserMessage] : messages;

    if (allMessages.length === 0) {
      return [];
    }

    const items: IntermediateItem[] = [];
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
    allMessages.forEach((message) => {
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
    allMessages.forEach((message) => {
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

    // Merge consecutive tools into the preceding message's followingTools
    const finalItems: CoalescedItem[] = [];
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      if (item.type === "message" && item.message) {
        // Collect all consecutive tools after this message
        const followingTools: ToolCallData[] = [];
        let j = i + 1;
        while (j < items.length && items[j].type === "tool") {
          const t = items[j];
          followingTools.push({
            toolUseId: t.toolUseId,
            toolName: t.toolName,
            toolInput: t.toolInput,
            toolResult: t.toolResult,
            toolError: t.toolError,
            toolStartTime: t.toolStartTime,
            toolEndTime: t.toolEndTime,
            hasResult: t.hasResult,
            display: t.display,
          });
          j++;
        }
        finalItems.push({
          type: "message",
          message: item.message,
          followingTools: followingTools.length > 0 ? followingTools : undefined,
        });
        i = j;
      } else if (item.type === "tool") {
        // Orphan tool (no preceding message) - create a placeholder message
        const followingTools: ToolCallData[] = [];
        let j = i;
        while (j < items.length && items[j].type === "tool") {
          const t = items[j];
          followingTools.push({
            toolUseId: t.toolUseId,
            toolName: t.toolName,
            toolInput: t.toolInput,
            toolResult: t.toolResult,
            toolError: t.toolError,
            toolStartTime: t.toolStartTime,
            toolEndTime: t.toolEndTime,
            hasResult: t.hasResult,
            display: t.display,
          });
          j++;
        }
        // Create a synthetic message for orphan tools
        finalItems.push({
          type: "message",
          message: {
            message_id: `orphan-tools-${i}`,
            conversation_id: "",
            type: "llm",
            user_data: null,
            llm_data: null,
            display_data: null,
            created_at: new Date().toISOString(),
          },
          followingTools,
        });
        i = j;
      } else {
        i++;
      }
    }

    // When showTools is false and indicatorMode is "inline", merge consecutive LLM messages into segments
    if (!showTools && indicatorMode === "inline") {
      const mergedItems: CoalescedItem[] = [];
      let i = 0;
      while (i < finalItems.length) {
        const item = finalItems[i];
        // Only merge agent/tool messages (not user, gitinfo, etc.)
        if (item.message.type === "agent" || item.message.type === "tool") {
          // Extract text from this message's llm_data
          const getTextFromMessage = (msg: Message): string => {
            if (!msg.llm_data) return "";
            try {
              const llmData = typeof msg.llm_data === "string" ? JSON.parse(msg.llm_data) : msg.llm_data;
              if (llmData?.Content && Array.isArray(llmData.Content)) {
                return llmData.Content
                  .filter((c: LLMContent) => c.Type === 2) // text type
                  .map((c: LLMContent) => c.Text || "")
                  .join("")
                  .trim();
              }
            } catch { /* ignore */ }
            return "";
          };

          // Collect consecutive LLM messages
          const segments: MessageSegment[] = [];
          let j = i;
          while (j < finalItems.length) {
            const current = finalItems[j];
            // Stop if we hit a user message or gitinfo
            if (current.message.type === "user" || current.message.type === "gitinfo" || current.message.type === "error") break;
            
            const text = getTextFromMessage(current.message);
            if (text || current.followingTools?.length) {
              segments.push({
                text,
                followingTools: current.followingTools,
              });
            }
            j++;
          }

          if (segments.length > 1) {
            // Merge all segments into the first message
            mergedItems.push({
              type: "message",
              message: item.message,
              followingTools: item.followingTools,
              mergedSegments: segments,
            });
          } else {
            // Single message, no merging needed
            mergedItems.push(item);
            j = i + 1; // Reset j since we didn't actually merge
          }
          i = j;
        } else {
          // User message or other type, keep as-is
          mergedItems.push(item);
          i++;
        }
      }
      return mergedItems;
    }

    return finalItems;
  }, [messages, pendingUserMessage, showTools, indicatorMode]);

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
      return (
        <MessageComponent
          message={item.message}
          followingTools={item.followingTools}
          showTools={showTools}
          mergedSegments={item.mergedSegments}
          indicatorMode={indicatorMode}
          expansionBehavior={expansionBehavior}
          compact={compact}
          onOpenDiffViewer={(commit) => {
            setDiffViewerInitialCommit(commit);
            setShowDiffViewer(true);
          }}
          onCommentTextChange={setDiffCommentText}
        />
      );
    },
    [showTools, indicatorMode, expansionBehavior, compact, setDiffCommentText]
  );

  // Compute item key for Virtualizer
  const computeItemKey = useCallback(
    (index: number, item: CoalescedItem) => {
      return item.message.message_id;
    },
    []
  );



  return (
    <div className={`full-height flex flex-col${compact ? " compact-mode" : ""}`}>
      {/* Header */}
      <div className={`header${isFocused && showPaneControls ? ' header-focused' : ''}${isDisconnected ? ' header-disconnected' : error ? ' header-error' : (() => {
        const maxTokens = models.find((m) => m.id === selectedModel)?.max_context_tokens || 200000;
        const pct = maxTokens > 0 ? (contextWindowSize / maxTokens) * 100 : 0;
        if (pct >= 80) return ' header-context-danger';
        if (pct >= 50) return ' header-context-warning';
        return '';
      })()}`}>
        <div className="header-left">
          {/* Agent status indicator - clickable to stop when working */}
          {conversationId && (
            agentWorking ? (
              <button
                className="agent-status-indicator working clickable"
                onClick={handleCancel}
                disabled={cancelling}
                title={cancelling ? "Stopping..." : "Click to stop"}
                aria-label={cancelling ? "Stopping..." : "Stop agent"}
              />
            ) : (
              <span
                className={`agent-status-indicator ${error ? "error" : "stopped"}`}
                title={error ? "Ended with error" : "Waiting for input"}
              />
            )
          )}
          <button
            onClick={onOpenDrawer}
            className="btn-icon hide-on-desktop"
            aria-label="Open sidebar"
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

          {showPaneControls && (
            <>
              {isMaximized && onRestoreFromMaximized ? (
                <button
                  className="pane-header-btn"
                  onClick={onRestoreFromMaximized}
                  title="Restore"
                  aria-label="Restore from maximized"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                  </svg>
                </button>
              ) : (
                <>
                  {onClose && (
                    <button
                      className="pane-header-btn"
                      onClick={onClose}
                      title="Close"
                      aria-label="Close pane"
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {onMaximize && (
                    <button
                      className="pane-header-btn"
                      onClick={onMaximize}
                      title="Maximize"
                      aria-label="Maximize pane"
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </>
          )}
          <h1
            className="header-title"
            title={currentConversation?.slug ? `Click to copy: ${currentConversation.slug}` : "Shelley"}
            onClick={() => {
              if (currentConversation?.slug) {
                navigator.clipboard.writeText(currentConversation.slug);
                setShowCopied(true);
                setTimeout(() => setShowCopied(false), 1500);
              }
            }}
            style={{ cursor: currentConversation?.slug ? 'pointer' : 'default', position: 'relative' }}
          >
            <span style={{ visibility: showCopied ? 'hidden' : 'visible' }}>{getDisplayTitle()}</span>
            {showCopied && (
              <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center' }}>Copied!</span>
            )}
          </h1>

          {/* Status badges in header */}
          {isDisconnected && (
            <button
              className="header-status-badge header-status-disconnected"
              onClick={handleManualReconnect}
              title="Click to reconnect"
            >
              Disconnected · Retry
            </button>
          )}
          {error && !isDisconnected && (
            <span className="header-status-badge header-status-error" title={error}>
              Error
            </span>
          )}

          {/* Archive button */}
          {conversationId && (
            <button
              className="pane-header-btn"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await api.archiveConversation(conversationId);
                  onConversationArchived?.(conversationId);
                } catch (err) {
                  console.error("Failed to archive:", err);
                }
              }}
              title="Archive conversation"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </button>
          )}
        </div>

        {/* Model/Dir info */}
        <div className="header-info">
          <div className="header-info-row">
            <span className="header-info-label">Model:</span>
            <span className="header-info-value">{selectedModel}</span>
          </div>
          <div className="header-info-row">
            <span className="header-info-label">Dir:</span>
            <span className="header-info-value">{currentConversation?.cwd || selectedCwd || "/"}</span>
          </div>
        </div>

        {/* Pane directory indicator (shown when pane controls are visible) */}
        {showPaneControls && (
          <div className="pane-cwd" title={currentConversation?.cwd || selectedCwd || "/"}>
            {(() => {
              const cwd = currentConversation?.cwd || selectedCwd || "/";
              const homeDir = window.__SHELLEY_INIT__?.home_dir;
              if (homeDir && cwd === homeDir) return "~";
              if (homeDir && cwd.startsWith(homeDir + "/")) return "~" + cwd.slice(homeDir.length);
              return cwd;
            })()}
          </div>
        )}

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

          {/* Tool visibility toggle */}
          <button
            onClick={() => {
              const newValue = !showTools;
              setShowTools(newValue);
              localStorage.setItem("shelley-show-tools", String(newValue));
            }}
            className={`btn-tool-toggle ${showTools ? "" : "tools-hidden"}`}
            aria-label={showTools ? "Hide tools" : "Show tools"}
            title={showTools ? "Hide tools" : "Show tools"}
          >
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ width: "1rem", height: "1rem" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M6 6.87803V6C6 4.75736 7.00736 3.75 8.25 3.75H15.75C16.9926 3.75 18 4.75736 18 6V6.87803M6 6.87803C6.23458 6.79512 6.48702 6.75 6.75 6.75H17.25C17.513 6.75 17.7654 6.79512 18 6.87803M6 6.87803C5.12611 7.18691 4.5 8.02034 4.5 9V9.87803M18 6.87803C18.8739 7.18691 19.5 8.02034 19.5 9V9.87803M19.5 9.87803C19.2654 9.79512 19.013 9.75 18.75 9.75H5.25C4.98702 9.75 4.73458 9.79512 4.5 9.87803M19.5 9.87803C20.3739 10.1869 21 11.0203 21 12V18C21 19.2426 19.9926 20.25 18.75 20.25H5.25C4.00736 20.25 3 19.2426 3 18V12C3 11.0203 3.62611 10.1869 4.5 9.87803"
              />
            </svg>
          </button>

          {/* Green + icon in circle for new conversation */}
          <button onClick={(e) => { e.stopPropagation(); onNewConversation(); }} className="btn-new" aria-label="New conversation">
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

          {/* Diffs button - show when we have a CWD */}
          {/* Diffs button */}
          {(currentConversation?.cwd || selectedCwd) && (
            <button
              onClick={() => setShowDiffViewer(true)}
              className="btn-tool-toggle"
              title="View Diffs"
              aria-label="View Diffs"
            >
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      {/* Messages area with scroll-to-bottom button wrapper */}
      <div className="messages-area-wrapper" onClick={handleMessagesAreaClick}>
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
                setShowScrollToBottom((prev) => (prev === !atBottom ? prev : !atBottom));
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

      {/* Status Bar - only shown for new conversations (model/cwd selection) */}
      {!conversationId && (
        <div className="status-bar">
          <div className="status-bar-content">
            <div
              className="status-bar-new-conversation status-bar-clickable"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.tagName !== 'SELECT' && target.tagName !== 'BUTTON' && !target.closest('select') && !target.closest('button')) {
                  setMobileInputVisible(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const target = e.target as HTMLElement;
                  if (target.tagName !== 'SELECT' && target.tagName !== 'BUTTON') {
                    e.preventDefault();
                    setMobileInputVisible(true);
                  }
                }
              }}
              role="button"
              tabIndex={0}
            >
              {/* Model selector */}
              <div
                className="status-field status-field-model"
                title="AI model to use for this conversation"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="status-field-label">Model:</span>
                <select
                  id="model-select-status"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={sending}
                  className="status-select"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id} disabled={!model.ready}>
                      {model.id} {!model.ready ? "(not ready)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* CWD indicator */}
              <div
                className={`status-field status-field-cwd${cwdError ? " status-field-error" : ""}`}
                title={cwdError || "Working directory for file operations"}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="status-field-label">Dir:</span>
                <button
                  className={`status-chip${cwdError ? " status-chip-error" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDirectoryPicker(true);
                  }}
                  disabled={sending}
                >
                  {selectedCwd || "(no cwd)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message input */}
      {compact ? (
        // Compact mode: use modal for input
        <InputModal
          isOpen={mobileInputVisible}
          onClose={() => setMobileInputVisible(false)}
          onSend={async (msg) => {
            await sendMessage(msg);
          }}
          sending={sending}
          agentWorking={agentWorking}
          onCancel={handleCancel}
          conversationTitle={currentConversation?.slug || undefined}
          enterBehavior={enterBehavior}
          persistKey={conversationId || "new-conversation"}
        />
      ) : (
        // Normal mode: inline input
        <MessageInput
          key={conversationId || "new"}
          onSend={async (msg) => {
            await sendMessage(msg);
          }}
          disabled={loading}
          autoFocus={true}
          injectedText={diffCommentText}
          onClearInjectedText={() => setDiffCommentText("")}
          persistKey={conversationId || "new-conversation"}
          mobileVisible={true}
          agentWorking={agentWorking}
          onCancel={handleCancel}
          enterBehavior={enterBehavior}
        />
      )}

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
