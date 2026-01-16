import { useState, useEffect } from "react";
import ChatInterface from "./ChatInterface";
import { Conversation } from "../types";
import { computeDisplayIds } from "../utils/pane";

interface PaneGridProps {
  columnCount: number;
  rowCount: number;
  openConversationIds: string[];
  focusedConversationId: string | null;
  maximizedConversationId: string | null;
  hasNewPane: boolean;
  conversations: Conversation[];
  onFocusPane: (conversationId: string | null) => void;
  onClosePane: (conversationId: string | null) => void;
  onMaximizePane: (conversationId: string) => void;
  onRestoreFromMaximized: () => void;
  onOpenDrawer: () => void;
  onNewConversation: () => void;
  onConversationUpdate: (conversation: Conversation) => void;
  onConversationArchived: (conversationId: string) => void;
  onFirstMessage: (message: string, model: string, cwd?: string) => Promise<void>;
  mostRecentCwd: string | null;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => 
    window.matchMedia('(max-width: 767px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

export function PaneGrid({
  columnCount,
  rowCount,
  openConversationIds,
  focusedConversationId,
  maximizedConversationId,
  hasNewPane,
  conversations,
  onFocusPane,
  onClosePane,
  onMaximizePane,
  onRestoreFromMaximized,
  onOpenDrawer,
  onNewConversation,
  onConversationUpdate,
  onConversationArchived,
  onFirstMessage,
  mostRecentCwd,
}: PaneGridProps) {
  const isMobile = useIsMobile();
  
  // Check if we're in maximized mode
  const isMaximized = maximizedConversationId !== null;
  
  // Single pane mode: show only the focused conversation (traditional UX)
  const isSinglePaneMode = (columnCount === 1 && rowCount === 1) || isMaximized;
  
  // Determine which conversations to display
  const displayIds = computeDisplayIds(
    columnCount, rowCount, openConversationIds, focusedConversationId, maximizedConversationId, hasNewPane
  );
  
  // Use compact mode when there are multiple panes or on mobile (but not when maximized)
  const isCompact = (!isSinglePaneMode || isMobile) && !isMaximized;
  
  // Show pane controls when there are multiple panes, maximized, or on mobile
  const showPaneControls = !isSinglePaneMode || isMaximized || isMobile;
  
  // Calculate grid layout
  const effectiveColumnCount = isSinglePaneMode ? 1 : columnCount;
  const effectiveRowCount = isSinglePaneMode ? 1 : rowCount;

  // Create grid of panes (fill remaining slots with empty)
  const totalSlots = effectiveColumnCount * effectiveRowCount;
  const slots: (string | null)[] = [];
  for (let i = 0; i < totalSlots; i++) {
    if (i < displayIds.length) {
      slots.push(displayIds[i]);
    } else {
      slots.push(undefined as unknown as null); // Empty slot marker
    }
  }

  return (
    <div
      className="pane-grid"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${effectiveColumnCount}, 1fr)`,
        gridTemplateRows: `repeat(${effectiveRowCount}, 1fr)`,
        gap: "1px",
        height: "100%",
        backgroundColor: "var(--border)",
      }}
    >
      {slots.map((conversationId, index) => {
        // undefined means empty slot (not a pane)
        if (conversationId === undefined) {
          return (
            <div
              key={`empty-${index}`}
              className="pane-empty"
              style={{ backgroundColor: "var(--bg-base)" }}
            />
          );
        }

        // null means "new conversation" pane
        // string means existing conversation
        const conversation = conversationId 
          ? conversations.find((c) => c.conversation_id === conversationId)
          : undefined;
        // For new pane (null), check if focusedConversationId is also null
        const isFocused = conversationId === null 
          ? focusedConversationId === null 
          : conversationId === focusedConversationId;
        // Show focus border only when multiple panes are visible on screen
        const showFocusBorder = isFocused && displayIds.length > 1;

        return (
          <div
            key={conversationId || "new"}
            className={`pane ${showFocusBorder ? "pane-focused" : ""}`}
            onClick={() => onFocusPane(conversationId)}
            style={{ backgroundColor: "var(--bg-base)", position: "relative" }}
          >
            <ChatInterface
              conversationId={conversationId}
              onOpenDrawer={onOpenDrawer}
              onNewConversation={onNewConversation}
              currentConversation={conversation}
              onConversationUpdate={onConversationUpdate}
              onConversationArchived={onConversationArchived}
              onFirstMessage={onFirstMessage}
              mostRecentCwd={mostRecentCwd}
              compact={isCompact}
              isFocused={isFocused}
              isMaximized={isMaximized}
              onRestoreFromMaximized={onRestoreFromMaximized}
              showPaneControls={showPaneControls}
              onMaximize={() => conversationId && onMaximizePane(conversationId)}
              onClose={() => onClosePane(conversationId)}
            />
          </div>
        );
      })}
    </div>
  );
}
