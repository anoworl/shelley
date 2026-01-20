import React, { useState, useEffect, useCallback, useRef } from "react";
import { PaneGrid } from "./components/PaneGrid";
import ConversationDrawer from "./components/ConversationDrawer";
import { useSwipeDrawer } from "./hooks/useSwipeDrawer";
import { usePaneState } from "./hooks/usePaneState";
import { Conversation } from "./types";
import { api } from "./services/api";
import { computeDisplayIds } from "./utils/pane";

// Get conversation ID from the current URL path (expects /c/<id> format)
function getIdFromPath(): string | null {
  const path = window.location.pathname;
  if (path.startsWith("/c/")) {
    const id = path.slice(3); // Remove "/c/" prefix
    if (id) {
      return id;
    }
  }
  return null;
}

// Capture the initial ID from URL BEFORE React renders
const initialIdFromUrl = getIdFromPath();

// Update the URL to reflect the focused conversation ID
function updateUrlWithId(conversationId: string | null) {
  const currentId = getIdFromPath();
  if (currentId !== conversationId) {
    if (conversationId) {
      window.history.replaceState({}, "", `/c/${conversationId}`);
    } else {
      window.history.replaceState({}, "", "/");
    }
  }
}

function updatePageTitle(conversation: Conversation | undefined) {
  const hostname = window.__SHELLEY_INIT__?.hostname;
  const parts: string[] = [];

  if (conversation?.slug) {
    parts.push(conversation.slug);
  }
  if (hostname) {
    parts.push(hostname);
  }
  parts.push("Shelley Agent");

  document.title = parts.join(" - ");
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [paneState, paneActions] = usePaneState(initialIdFromUrl);
  const { columnCount, rowCount, openConversationIds, focusedConversationId, maximizedConversationId, hasNewPane } = paneState;
  const { setColumnCount, setRowCount, openConversation, closeConversation, focusConversation, maximizeConversation, restoreFromMaximized, bringToFront, openNewConversation, closeNewPane } = paneActions;

  // Track CWD from previously focused conversation (for inheriting when opening new conversation)
  const [inheritedCwd, setInheritedCwd] = useState<string | null>(null);

  // Drawer open state - default to open on desktop, closed on mobile
  const [drawerOpen, setDrawerOpen] = useState(() => {
    const stored = localStorage.getItem('shelley_drawer_open');
    if (stored !== null) return stored === 'true';
    return window.innerWidth >= 768; // Default: open on desktop
  });

  // Persist drawer state
  const toggleDrawer = useCallback((open: boolean) => {
    setDrawerOpen(open);
    localStorage.setItem('shelley_drawer_open', String(open));
  }, []);
  const [loading, setLoading] = useState(true);

  // Enable swipe gestures to open/close drawer on mobile
  useSwipeDrawer(
    drawerOpen,
    () => toggleDrawer(true),
    () => toggleDrawer(false),
  );
  const [error, setError] = useState<string | null>(null);
  const initialSlugResolved = useRef(false);

  // Resolve initial conversation ID from URL
  const resolveInitialId = useCallback(async (convs: Conversation[]) => {
    if (initialSlugResolved.current) return null;
    initialSlugResolved.current = true;

    const urlId = initialIdFromUrl;
    if (!urlId) return null;

    // Check if this conversation exists in our list
    const existingConv = convs.find((c) => c.conversation_id === urlId);
    if (existingConv) {
      return existingConv.conversation_id;
    }

    // Otherwise, try to fetch by ID (might be archived)
    try {
      const response = await api.getConversation(urlId);
      if (response?.conversation) {
        return response.conversation.conversation_id;
      }
    } catch (err) {
      console.error("Failed to resolve conversation ID:", err);
    }

    // Conversation not found, clear the URL
    window.history.replaceState({}, "", "/");
    return null;
  }, []);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Subscribe to conversation metadata updates
  useEffect(() => {
    const eventSource = api.createConversationsStream();

    eventSource.onmessage = (event) => {
      try {
        const updatedConversation: Conversation = JSON.parse(event.data);
        setConversations((prev) =>
          prev.map((conv) =>
            conv.conversation_id === updatedConversation.conversation_id
              ? updatedConversation
              : conv,
          ),
        );
      } catch (err) {
        console.error("Failed to parse conversation update:", err);
      }
    };

    eventSource.onerror = () => {
      // SSE will auto-reconnect
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Update page title and URL when focused conversation changes
  useEffect(() => {
    const focusedConv = conversations.find(
      (conv) => conv.conversation_id === focusedConversationId,
    );
    updatePageTitle(focusedConv);
    updateUrlWithId(focusedConversationId);
  }, [focusedConversationId, conversations]);

  // Keyboard shortcuts for pane navigation
  useEffect(() => {
    const isMaximized = maximizedConversationId !== null;
    const isSinglePaneMode = (columnCount === 1 && rowCount === 1) || isMaximized;
    
    // Only enable pane navigation in multi-pane mode
    if (isSinglePaneMode) return;
    
    const displayIds = computeDisplayIds(
      columnCount, rowCount, openConversationIds, focusedConversationId, maximizedConversationId, hasNewPane
    );
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const currentIndex = displayIds.findIndex(id => id === focusedConversationId);
      // If focused pane not found in display, default to 0
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
      let nextIndex = -1;
      
      // Tab / Shift+Tab: cycle through panes
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          // Previous pane
          nextIndex = safeCurrentIndex <= 0 ? displayIds.length - 1 : safeCurrentIndex - 1;
        } else {
          // Next pane
          nextIndex = safeCurrentIndex >= displayIds.length - 1 ? 0 : safeCurrentIndex + 1;
        }
      }
      
      // Alt + Arrow keys: directional navigation
      if (e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const col = safeCurrentIndex % columnCount;
        const row = Math.floor(safeCurrentIndex / columnCount);
        
        switch (e.key) {
          case 'ArrowLeft':
            if (col > 0) nextIndex = safeCurrentIndex - 1;
            break;
          case 'ArrowRight':
            if (safeCurrentIndex + 1 < displayIds.length) nextIndex = safeCurrentIndex + 1;
            break;
          case 'ArrowUp':
            if (row > 0) nextIndex = safeCurrentIndex - columnCount;
            break;
          case 'ArrowDown':
            if (safeCurrentIndex + columnCount < displayIds.length) nextIndex = safeCurrentIndex + columnCount;
            break;
        }
      }
      
      // h/l: horizontal pane navigation (wrap to next/prev row at edges)
      // j/k: vertical pane navigation (wrap top/bottom)
      if (['h', 'l', 'j', 'k'].includes(e.key)) {
        e.preventDefault();
        const col = safeCurrentIndex % columnCount;
        const row = Math.floor(safeCurrentIndex / columnCount);
        const totalRows = Math.ceil(displayIds.length / columnCount);
        
        switch (e.key) {
          case 'h': // left, wrap to prev row's right edge
            if (col > 0) {
              nextIndex = safeCurrentIndex - 1;
            } else if (row > 0) {
              // At left edge, go to previous row's right edge
              const prevRowStart = (row - 1) * columnCount;
              const prevRowEnd = Math.min(prevRowStart + columnCount - 1, displayIds.length - 1);
              nextIndex = prevRowEnd;
            } else {
              // At top-left, wrap to bottom row's right edge
              nextIndex = displayIds.length - 1;
            }
            break;
          case 'l': // right, wrap to next row's left edge
            if (col < columnCount - 1 && safeCurrentIndex + 1 < displayIds.length) {
              nextIndex = safeCurrentIndex + 1;
            } else if (row < totalRows - 1) {
              // At right edge, go to next row's left edge
              const nextRowStart = (row + 1) * columnCount;
              if (nextRowStart < displayIds.length) {
                nextIndex = nextRowStart;
              }
            } else {
              // At bottom-right, wrap to top-left
              nextIndex = 0;
            }
            break;
          case 'j': // down, wrap to top
            if (safeCurrentIndex + columnCount < displayIds.length) {
              nextIndex = safeCurrentIndex + columnCount;
            } else {
              // At bottom, wrap to same column at top
              nextIndex = col;
            }
            break;
          case 'k': // up, wrap to bottom
            if (row > 0) {
              nextIndex = safeCurrentIndex - columnCount;
            } else {
              // At top, wrap to same column at bottom (or last valid cell)
              const bottomIndex = (totalRows - 1) * columnCount + col;
              nextIndex = Math.min(bottomIndex, displayIds.length - 1);
            }
            break;
        }
      }
      
      if (nextIndex >= 0 && nextIndex < displayIds.length) {
        const nextId = displayIds[nextIndex];
        // nextId can be null (new conversation pane) or string (existing conversation)
        if (nextId !== undefined) {
          focusConversation(nextId);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [columnCount, rowCount, openConversationIds, focusedConversationId, maximizedConversationId, hasNewPane, focusConversation]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      const convs = await api.getConversations();
      setConversations(convs);

      // Try to resolve conversation from URL ID first
      const urlConvId = await resolveInitialId(convs);
      if (urlConvId) {
        openConversation(urlConvId);
      } else if (openConversationIds.length === 0 && convs.length > 0) {
        // If no conversations are open and we have some, open the first
        openConversation(convs[0].conversation_id);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
      setError("Failed to load conversations. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  };

  const startNewConversation = () => {
    // Save current focused conversation's cwd before switching to new conversation
    const currentConv = focusedConversationId
      ? conversations.find(c => c.conversation_id === focusedConversationId)
      : null;
    setInheritedCwd(currentConv?.cwd ?? null);
    openNewConversation();
    // Close drawer on mobile only
    if (window.innerWidth < 768) toggleDrawer(false);
  };

  const selectConversation = (conversationId: string) => {
    if (openConversationIds.includes(conversationId)) {
      // Already open - check if it's in a visible slot
      const visibleSlots = columnCount * rowCount;
      const index = openConversationIds.indexOf(conversationId);
      if (index < visibleSlots) {
        // Already visible - just focus it without changing position
        focusConversation(conversationId);
      } else {
        // Not visible - bring to front
        bringToFront(conversationId);
      }
    } else {
      openConversation(conversationId);
    }
    // Close drawer on mobile only
    if (window.innerWidth < 768) toggleDrawer(false);
  };

  const updateConversation = (updatedConversation: Conversation) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.conversation_id === updatedConversation.conversation_id ? updatedConversation : conv,
      ),
    );
  };

  const handleConversationArchived = (conversationId: string) => {
    setConversations((prev) => prev.filter((conv) => conv.conversation_id !== conversationId));
    closeConversation(conversationId);
  };

  const handleConversationUnarchived = (conversation: Conversation) => {
    setConversations((prev) => [conversation, ...prev]);
  };

  const handleConversationRenamed = (conversation: Conversation) => {
    setConversations((prev) =>
      prev.map((c) => (c.conversation_id === conversation.conversation_id ? conversation : c)),
    );
  };

  if (loading && conversations.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="spinner" style={{ margin: "0 auto 1rem" }}></div>
          <p className="text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <div className="error-container">
        <div className="error-content">
          <p className="error-message" style={{ marginBottom: "1rem" }}>
            {error}
          </p>
          <button onClick={loadConversations} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Prefer the focused conversation's cwd, or inherited cwd for new conversations
  const focusedConversation = focusedConversationId
    ? conversations.find(c => c.conversation_id === focusedConversationId)
    : null;
  // For new conversation pane (focusedConversationId === null), use inherited cwd from previous focus
  const mostRecentCwd = focusedConversation?.cwd ?? inheritedCwd ?? window.__SHELLEY_INIT__?.home_dir ?? null;

  const handleFirstMessage = async (message: string, model: string, cwd?: string) => {
    try {
      const response = await api.sendMessageWithNewConversation({ message, model, cwd });
      const newConversationId = response.conversation_id;

      const updatedConvs = await api.getConversations();
      setConversations(updatedConvs);
      // New conversation pane was at the end, so keep it there
      openConversation(newConversationId, true);
    } catch (err) {
      console.error("Failed to send first message:", err);
      setError("Failed to send message");
      throw err;
    }
  };

  return (
    <div className="app-container">
      <ConversationDrawer
        isOpen={drawerOpen}
        onClose={() => toggleDrawer(false)}
        onOpen={() => toggleDrawer(true)}
        conversations={conversations}
        currentConversationId={focusedConversationId}
        openConversationIds={openConversationIds}
        onSelectConversation={selectConversation}
        onNewConversation={startNewConversation}
        onConversationArchived={handleConversationArchived}
        onConversationUnarchived={handleConversationUnarchived}
        onConversationRenamed={handleConversationRenamed}
        columnCount={columnCount}
        rowCount={rowCount}
        onColumnCountChange={setColumnCount}
        onRowCountChange={setRowCount}
      />

      <div className="main-content">
        <PaneGrid
          columnCount={columnCount}
          rowCount={rowCount}
          openConversationIds={openConversationIds}
          focusedConversationId={focusedConversationId}
          maximizedConversationId={maximizedConversationId}
          hasNewPane={hasNewPane}
          conversations={conversations}
          onFocusPane={focusConversation}
          onClosePane={(id) => id === null ? closeNewPane() : closeConversation(id)}
          onMaximizePane={maximizeConversation}
          onRestoreFromMaximized={restoreFromMaximized}
          onOpenDrawer={() => toggleDrawer(true)}
          onNewConversation={startNewConversation}
          onConversationUpdate={updateConversation}
          onConversationArchived={handleConversationArchived}
          onFirstMessage={handleFirstMessage}
          mostRecentCwd={mostRecentCwd}
        />
      </div>

      {drawerOpen && (
        <div className="backdrop hide-on-desktop" onClick={() => toggleDrawer(false)} />
      )}
    </div>
  );
}

export default App;
