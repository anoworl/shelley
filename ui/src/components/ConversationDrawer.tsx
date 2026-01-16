import React, { useState, useEffect, useMemo, useRef } from "react";
import { Conversation } from "../types";
import { api } from "../services/api";
import { getContextBarColor, formatTokens } from "../utils/context";
import { GridSelector } from "./ColumnSelector";
import { ThemeMode, getStoredTheme, setStoredTheme, applyTheme } from "../services/theme";
import SettingsModal from "./SettingsModal";

// Extract repository name from git origin URL
// e.g., "git@github.com:user/shelley.git" -> "shelley"
// e.g., "https://github.com/user/shelley.git" -> "shelley"
function extractRepoName(gitOrigin: string | null): string | null {
  if (!gitOrigin) return null;
  // Remove .git suffix if present
  let url = gitOrigin.replace(/\.git$/, "");
  // Handle SSH format: git@github.com:user/repo
  if (url.includes(":") && url.includes("@")) {
    const parts = url.split("/");
    return parts[parts.length - 1] || null;
  }
  // Handle HTTPS format: https://github.com/user/repo
  const parts = url.split("/");
  return parts[parts.length - 1] || null;
}

interface GroupedConversations {
  repoName: string | null;
  conversations: Conversation[];
}

interface ConversationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  conversations: Conversation[];
  currentConversationId: string | null;
  openConversationIds: string[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onConversationArchived?: (id: string) => void;
  onConversationUnarchived?: (conversation: Conversation) => void;
  onConversationRenamed?: (conversation: Conversation) => void;
  columnCount: number;
  rowCount: number;
  onColumnCountChange: (count: number) => void;
  onRowCountChange: (count: number) => void;
}

function ConversationDrawer({
  isOpen,
  onClose,
  onOpen,
  conversations,
  currentConversationId,
  openConversationIds,
  onSelectConversation,
  onNewConversation,
  onConversationArchived,
  onConversationUnarchived,
  onConversationRenamed,
  columnCount,
  rowCount,
  onColumnCountChange,
  onRowCountChange,
}: ConversationDrawerProps) {
  const hostname = window.__SHELLEY_INIT__?.hostname || "localhost";
  const terminalURL = window.__SHELLEY_INIT__?.terminal_url || null;
  const links = window.__SHELLEY_INIT__?.links || [];
  
  const [showArchived, setShowArchived] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredTheme);
  const [archivedConversations, setArchivedConversations] = useState<Conversation[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState("");
  const renameInputRef = React.useRef<HTMLInputElement>(null);
  const drawerBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showArchived && archivedConversations.length === 0) {
      loadArchivedConversations();
    }
  }, [showArchived]);

  const loadArchivedConversations = async () => {
    setLoadingArchived(true);
    try {
      const archived = await api.getArchivedConversations();
      setArchivedConversations(archived);
    } catch (err) {
      console.error("Failed to load archived conversations:", err);
    } finally {
      setLoadingArchived(false);
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Format cwd with ~ for home directory (display only)
  const formatCwdForDisplay = (cwd: string | null | undefined): string | null => {
    if (!cwd) return null;
    const homeDir = window.__SHELLEY_INIT__?.home_dir;
    if (homeDir && cwd === homeDir) {
      return "~";
    }
    if (homeDir && cwd.startsWith(homeDir + "/")) {
      return "~" + cwd.slice(homeDir.length);
    }
    return cwd;
  };

  const getConversationPreview = (conversation: Conversation) => {
    if (conversation.slug) {
      return conversation.slug;
    }
    // Show full conversation ID
    return conversation.conversation_id;
  };

  const handleArchive = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    try {
      await api.archiveConversation(conversationId);
      onConversationArchived?.(conversationId);
      // Refresh archived list if viewing
      if (showArchived) {
        loadArchivedConversations();
      }
    } catch (err) {
      console.error("Failed to archive conversation:", err);
    }
  };

  const handleUnarchive = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    try {
      const conversation = await api.unarchiveConversation(conversationId);
      setArchivedConversations((prev) => prev.filter((c) => c.conversation_id !== conversationId));
      onConversationUnarchived?.(conversation);
    } catch (err) {
      console.error("Failed to unarchive conversation:", err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this conversation?")) {
      return;
    }
    try {
      await api.deleteConversation(conversationId);
      setArchivedConversations((prev) => prev.filter((c) => c.conversation_id !== conversationId));
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  // Sanitize title: trim whitespace, collapse multiple spaces, max 60 chars
  const sanitizeTitle = (input: string): string => {
    return input
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60)
      .trim();
  };

  const handleStartRename = (e: React.MouseEvent, conversation: Conversation) => {
    e.stopPropagation();
    setEditingId(conversation.conversation_id);
    setEditingSlug(conversation.slug || "");
    // Select all text after render
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const handleRename = async (conversationId: string) => {
    const sanitized = sanitizeTitle(editingSlug);
    if (!sanitized) {
      setEditingId(null);
      return;
    }

    // Check for uniqueness against current conversations
    const isDuplicate = [...conversations, ...archivedConversations].some(
      (c) => c.slug === sanitized && c.conversation_id !== conversationId,
    );
    if (isDuplicate) {
      alert("A conversation with this name already exists");
      return;
    }

    try {
      const updated = await api.renameConversation(conversationId, sanitized);
      onConversationRenamed?.(updated);
      setEditingId(null);
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, conversationId: string) => {
    // Don't submit while IME is composing (e.g., converting Japanese hiragana to kanji)
    if (e.nativeEvent.isComposing) {
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleRename(conversationId);
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  const displayedConversations = showArchived ? archivedConversations : conversations;

  // Group conversations by repository name
  const groupedConversations = useMemo((): GroupedConversations[] => {
    const groups = new Map<string | null, Conversation[]>();
    
    for (const conv of displayedConversations) {
      const repoName = extractRepoName(conv.git_origin);
      const existing = groups.get(repoName) || [];
      existing.push(conv);
      groups.set(repoName, existing);
    }
    
    // Convert to array and sort conversations within each group by created_at desc
    const result: GroupedConversations[] = [];
    for (const [key, convs] of groups.entries()) {
      // Sort by created_at descending (newest first)
      convs.sort((a, b) => b.created_at.localeCompare(a.created_at));
      result.push({
        repoName: key,
        conversations: convs,
      });
    }
    
    // Sort groups by the most recently created conversation in each group
    result.sort((a, b) => {
      const aLatest = a.conversations[0]?.created_at || '';
      const bLatest = b.conversations[0]?.created_at || '';
      return bLatest.localeCompare(aLatest);
    });
    
    return result;
  }, [displayedConversations]);

  // Scroll to top when the first group changes (most recent conversation updated)
  const firstGroupName = groupedConversations[0]?.repoName;
  useEffect(() => {
    if (drawerBodyRef.current) {
      drawerBodyRef.current.scrollTop = 0;
    }
  }, [firstGroupName]);

  // Render a single conversation item
  const renderConversationItem = (conversation: Conversation) => {
    const isFocused = conversation.conversation_id === currentConversationId;
    const isOpen = openConversationIds.includes(conversation.conversation_id);
    return (
      <div
        key={conversation.conversation_id}
        className={`conversation-item ${isFocused ? "active" : ""} ${isOpen ? "open" : ""}`}
        onClick={() => {
          if (!showArchived) {
            onSelectConversation(conversation.conversation_id);
          }
        }}
        style={{ cursor: showArchived ? "default" : "pointer" }}
      >
        <span
          className={`agent-status-indicator ${conversation.agent_working ? "working" : conversation.agent_error ? "error" : "stopped"}`}
          title={conversation.agent_working ? "Agent is working" : conversation.agent_error ? "Ended with error" : "Waiting for input"}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingId === conversation.conversation_id ? (
            <input
              ref={renameInputRef}
              type="text"
              value={editingSlug}
              onChange={(e) => setEditingSlug(e.target.value)}
              onBlur={() => handleRename(conversation.conversation_id)}
              onKeyDown={(e) => handleRenameKeyDown(e, conversation.conversation_id)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="conversation-title"
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--text-secondary)",
                outline: "none",
                padding: 0,
                font: "inherit",
                color: "inherit",
              }}
            />
          ) : (
            <div className="conversation-title">
              {getConversationPreview(conversation)}
            </div>
          )}
          <div className="conversation-meta">
            <span className="conversation-date">
              {formatDate(conversation.updated_at)}
            </span>
            {conversation.cwd && (
              <span className="conversation-cwd" title={conversation.cwd}>
                {formatCwdForDisplay(conversation.cwd)}
              </span>
            )}
            {conversation.github_urls && (() => {
              const urls: string[] = JSON.parse(conversation.github_urls);
              if (urls.length === 0) return null;
              // Extract PR/Issue numbers from URLs (last one wins)
              const prUrls = urls.filter(u => u.includes('/pull/'));
              const issueUrls = urls.filter(u => u.includes('/issues/'));
              const lastPrUrl = prUrls.length > 0 ? prUrls[prUrls.length - 1] : null;
              const lastIssueUrl = issueUrls.length > 0 ? issueUrls[issueUrls.length - 1] : null;
              const lastPrNumber = lastPrUrl?.match(/\/pull\/(\d+)/)?.[1];
              const lastIssueNumber = lastIssueUrl?.match(/\/issues\/(\d+)/)?.[1];
              return (
                <span className="conversation-github-links" title={urls.join('\n')}>
                  {lastPrNumber && lastPrUrl && (
                    <a
                      href={lastPrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="github-link-badge pr"
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{lastPrNumber}
                    </a>
                  )}
                  {lastIssueNumber && lastIssueUrl && (
                    <a
                      href={lastIssueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="github-link-badge issue"
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{lastIssueNumber}
                    </a>
                  )}
                </span>
              );
            })()}
            {conversation.context_window_size > 0 && (() => {
              const maxTokens = 200000;
              const percentage = (conversation.context_window_size / maxTokens) * 100;
              return (
                <div
                  className="conversation-context-bar"
                  title={`${formatTokens(conversation.context_window_size)} tokens (${percentage.toFixed(0)}%)`}
                >
                  <div
                    className="conversation-context-fill"
                    style={{
                      width: `${Math.min(percentage, 100)}%`,
                      backgroundColor: getContextBarColor(percentage),
                    }}
                  />
                </div>
              );
            })()}
          </div>
        </div>
        <div
          className="conversation-actions"
          style={{ display: "flex", gap: "0.25rem", marginLeft: "0.5rem" }}
        >
          {showArchived ? (
            <>
              <button
                onClick={(e) => handleUnarchive(e, conversation.conversation_id)}
                className="btn-icon-sm"
                title="Restore"
                aria-label="Restore conversation"
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => handleDelete(e, conversation.conversation_id)}
                className="btn-icon-sm btn-danger"
                title="Delete permanently"
                aria-label="Delete conversation"
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => handleStartRename(e, conversation)}
                className="btn-icon-sm"
                title="Rename"
                aria-label="Rename conversation"
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
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => handleArchive(e, conversation.conversation_id)}
                className="btn-icon-sm"
                title="Archive"
                aria-label="Archive conversation"
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
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Drawer */}
      <div className={`drawer ${isOpen ? "open" : ""}`}>
        {/* Collapsed state - shown when drawer is closed on desktop */}
        <button
          className="drawer-collapsed"
          onClick={onOpen}
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-row">
            <a
              href={`https://${hostname}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="drawer-hostname"
              title={`Open https://${hostname}/`}
            >
              {hostname.split('.')[0]}
            </a>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
              <h2 className="drawer-title">{showArchived ? "Archived" : "Conversations"}</h2>
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="btn-icon-sm"
                title={showArchived ? "Back to Conversations" : "View Archived"}
                aria-label={showArchived ? "Back to Conversations" : "View Archived"}
              >
                <svg
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  style={{ width: "1rem", height: "1rem" }}
                >
                  {showArchived ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
                  )}
                </svg>
              </button>
            </div>
          </div>
          {!showArchived && (
            <GridSelector
              columns={columnCount}
              rows={rowCount}
              onColumnsChange={onColumnCountChange}
              onRowsChange={onRowCountChange}
            />
          )}
          <div className="drawer-header-actions">
            {/* New conversation button - mobile only */}
            {!showArchived && (
              <button
                onClick={onNewConversation}
                className="btn-icon hide-on-desktop"
                aria-label="New conversation"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="btn-icon"
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5 8.25 12l7.5-7.5"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Conversations list */}
        <div className="drawer-body scrollable" ref={drawerBodyRef}>
          {loadingArchived && showArchived ? (
            <div style={{ padding: "1rem", textAlign: "center" }} className="text-secondary">
              <p>Loading...</p>
            </div>
          ) : displayedConversations.length === 0 ? (
            <div style={{ padding: "1rem", textAlign: "center" }} className="text-secondary">
              <p>{showArchived ? "No archived conversations" : "No conversations yet"}</p>
              {!showArchived && (
                <p className="text-sm" style={{ marginTop: "0.25rem" }}>
                  Start a new conversation to get started
                </p>
              )}
            </div>
          ) : (
            <div className="conversation-list">
              {groupedConversations.map((group) => (
                <div key={group.repoName || "__no_repo__"} className="conversation-group">
                  <div className="conversation-group-header">
                    {group.repoName || "other"}
                  </div>
                  {group.conversations.map(renderConversationItem)}
                </div>
              ))}
            </div>
          )}
          {/* Close area at bottom */}
          <button
            className="drawer-close-area"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>

        {/* Footer bar with global actions */}
        <div className="drawer-footer">
          {/* Terminal */}
          {terminalURL && (
            <a
              href={terminalURL}
              target="_blank"
              rel="noopener noreferrer"
              className="drawer-footer-btn"
              title="Terminal"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </a>
          )}

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="drawer-footer-btn"
            title="Settings"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Theme toggle - shows current theme, hover to see options */}
          <div className="theme-picker">
            <button className="theme-picker-current drawer-footer-btn" title="Change theme">
              {themeMode === "light" && (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              )}
              {themeMode === "dark" && (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
              {themeMode === "system" && (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
              )}
            </button>
            <div className="theme-picker-popup">
              <button
                onClick={() => { setThemeMode("light"); setStoredTheme("light"); applyTheme("light"); }}
                className={`theme-picker-option ${themeMode === "light" ? "active" : ""}`}
                title="Light"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              </button>
              <button
                onClick={() => { setThemeMode("dark"); setStoredTheme("dark"); applyTheme("dark"); }}
                className={`theme-picker-option ${themeMode === "dark" ? "active" : ""}`}
                title="Dark"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              </button>
              <button
                onClick={() => { setThemeMode("system"); setStoredTheme("system"); applyTheme("system"); }}
                className={`theme-picker-option ${themeMode === "system" ? "active" : ""}`}
                title="System"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
              </button>
            </div>
          </div>

          {/* External links */}
          {links.map((link, index) => (
            <a
              key={index}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="drawer-footer-btn"
              title={link.title}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={link.icon_svg || "M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"} />
              </svg>
            </a>
          ))}
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  );
}

export default ConversationDrawer;
