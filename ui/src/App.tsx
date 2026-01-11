import React, { useState, useEffect, useCallback, useRef } from "react";
import ChatInterface from "./components/ChatInterface";
import ConversationDrawer from "./components/ConversationDrawer";
import { useSwipeDrawer } from "./hooks/useSwipeDrawer";
import { Conversation } from "./types";
import { api } from "./services/api";

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

// Update the URL to reflect the current conversation ID
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
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Enable swipe gestures to open/close drawer on mobile
  useSwipeDrawer(
    drawerOpen,
    () => setDrawerOpen(true),
    () => setDrawerOpen(false),
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

  // Update page title and URL when conversation changes
  useEffect(() => {
    const currentConv = conversations.find(
      (conv) => conv.conversation_id === currentConversationId,
    );
    updatePageTitle(currentConv);
    updateUrlWithId(currentConversationId);
  }, [currentConversationId, conversations]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      const convs = await api.getConversations();
      setConversations(convs);

      // Try to resolve conversation from URL ID first
      const urlConvId = await resolveInitialId(convs);
      if (urlConvId) {
        setCurrentConversationId(urlConvId);
      } else if (!currentConversationId && convs.length > 0) {
        // If we have conversations and no current one selected, select the first
        setCurrentConversationId(convs[0].conversation_id);
      }
      // If no conversations exist, leave currentConversationId as null
      // The UI will show the welcome screen and create conversation on first message
    } catch (err) {
      console.error("Failed to load conversations:", err);
      setError("Failed to load conversations. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  };

  const startNewConversation = () => {
    // Just clear the current conversation - a new one will be created when the user sends their first message
    setCurrentConversationId(null);
    setDrawerOpen(false);
  };

  const selectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    setDrawerOpen(false);
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
    // If the archived conversation was current, switch to another or clear
    if (currentConversationId === conversationId) {
      const remaining = conversations.filter((conv) => conv.conversation_id !== conversationId);
      setCurrentConversationId(remaining.length > 0 ? remaining[0].conversation_id : null);
    }
  };

  const handleConversationUnarchived = (conversation: Conversation) => {
    // Add the unarchived conversation back to the list
    setConversations((prev) => [conversation, ...prev]);
  };

  const handleConversationRenamed = (conversation: Conversation) => {
    // Update the conversation in the list with the new slug
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

  const currentConversation = conversations.find(
    (conv) => conv.conversation_id === currentConversationId,
  );

  // Get the CWD from the most recent conversation (first in list, sorted by updated_at desc)
  const mostRecentCwd = conversations.length > 0 ? conversations[0].cwd : null;

  const handleFirstMessage = async (message: string, model: string, cwd?: string) => {
    try {
      const response = await api.sendMessageWithNewConversation({ message, model, cwd });
      const newConversationId = response.conversation_id;

      // Fetch the new conversation details
      const updatedConvs = await api.getConversations();
      setConversations(updatedConvs);
      setCurrentConversationId(newConversationId);
    } catch (err) {
      console.error("Failed to send first message:", err);
      setError("Failed to send message");
      throw err;
    }
  };

  return (
    <div className="app-container">
      {/* Conversations drawer */}
      <ConversationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={selectConversation}
        onNewConversation={startNewConversation}
        onConversationArchived={handleConversationArchived}
        onConversationUnarchived={handleConversationUnarchived}
        onConversationRenamed={handleConversationRenamed}
      />

      {/* Main chat interface */}
      <div className="main-content">
        <ChatInterface
          conversationId={currentConversationId}
          onOpenDrawer={() => setDrawerOpen(true)}
          onNewConversation={startNewConversation}
          currentConversation={currentConversation}
          onConversationUpdate={updateConversation}
          onFirstMessage={handleFirstMessage}
          mostRecentCwd={mostRecentCwd}
        />
      </div>

      {/* Backdrop for mobile drawer */}
      {drawerOpen && (
        <div className="backdrop hide-on-desktop" onClick={() => setDrawerOpen(false)} />
      )}
    </div>
  );
}

export default App;
