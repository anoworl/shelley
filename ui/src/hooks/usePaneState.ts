import { useState, useEffect, useCallback } from "react";

const STORAGE_KEYS = {
  columns: "shelley_pane_columns",
  rows: "shelley_pane_rows",
  openConversations: "shelley_open_conversations",
  focusedConversation: "shelley_focused_conversation",
} as const;

const DEFAULT_COLUMNS = 3;
const DEFAULT_ROWS = 2;

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return JSON.parse(stored);
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

export interface PaneState {
  columnCount: number;
  rowCount: number;
  openConversationIds: string[];
  focusedConversationId: string | null;
  maximizedConversationId: string | null;
  hasNewPane: boolean; // Whether a "new conversation" pane is open
}

export interface PaneActions {
  setColumnCount: (count: number) => void;
  setRowCount: (count: number) => void;
  openConversation: (id: string, atEnd?: boolean) => void;
  closeConversation: (id: string | null) => void;
  focusConversation: (id: string | null) => void;
  setOpenConversationIds: (ids: string[]) => void;
  maximizeConversation: (id: string) => void;
  restoreFromMaximized: () => void;
  bringToFront: (id: string) => void;
  openNewConversation: () => void;
  closeNewPane: () => void;
}

export function usePaneState(initialFocusedId: string | null): [PaneState, PaneActions] {
  const [columnCount, setColumnCountState] = useState<number>(() =>
    loadFromStorage(STORAGE_KEYS.columns, DEFAULT_COLUMNS)
  );

  const [rowCount, setRowCountState] = useState<number>(() =>
    loadFromStorage(STORAGE_KEYS.rows, DEFAULT_ROWS)
  );

  const [openConversationIds, setOpenConversationIdsState] = useState<string[]>(() =>
    loadFromStorage(STORAGE_KEYS.openConversations, [])
  );

  const [focusedConversationId, setFocusedConversationIdState] = useState<string | null>(() => {
    // URL takes priority over localStorage
    if (initialFocusedId) return initialFocusedId;
    return loadFromStorage(STORAGE_KEYS.focusedConversation, null);
  });

  const [maximizedConversationId, setMaximizedConversationId] = useState<string | null>(null);
  const [hasNewPane, setHasNewPane] = useState<boolean>(() => {
    // Start with a new pane if no conversations are open and no focused conversation
    const storedFocused = loadFromStorage<string | null>(STORAGE_KEYS.focusedConversation, null);
    return storedFocused === null;
  });

  // Ensure initialFocusedId is in openConversationIds
  useEffect(() => {
    if (initialFocusedId && !openConversationIds.includes(initialFocusedId)) {
      setOpenConversationIdsState((prev) => {
        const next = [initialFocusedId, ...prev];
        saveToStorage(STORAGE_KEYS.openConversations, next);
        return next;
      });
    }
  }, [initialFocusedId]);

  // Persist columnCount
  const setColumnCount = useCallback((count: number) => {
    const validCount = Math.max(1, count);
    setColumnCountState(validCount);
    saveToStorage(STORAGE_KEYS.columns, validCount);
  }, []);

  // Persist rowCount
  const setRowCount = useCallback((count: number) => {
    const validCount = Math.max(1, count);
    setRowCountState(validCount);
    saveToStorage(STORAGE_KEYS.rows, validCount);
  }, []);

  // Open a conversation and focus it
  // atEnd: if true, append to end instead of prepending to front
  const openConversation = useCallback((id: string, atEnd: boolean = false) => {
    setOpenConversationIdsState((prev) => {
      if (prev.includes(id)) {
        // Already open, just focus
        return prev;
      }
      const next = atEnd ? [...prev, id] : [id, ...prev];
      saveToStorage(STORAGE_KEYS.openConversations, next);
      return next;
    });
    setFocusedConversationIdState(id);
    saveToStorage(STORAGE_KEYS.focusedConversation, id);
  }, []);

  // Close a conversation (or the new conversation pane if id is null)
  const closeConversation = useCallback((id: string | null) => {
    // If closing the "new conversation" pane (id is null), just focus the first open conversation
    if (id === null) {
      // We need to get the current openConversationIds to find the first one
      // Use a ref pattern via setState to access current state
      setOpenConversationIdsState((currentOpenIds) => {
        const firstOpen = currentOpenIds.length > 0 ? currentOpenIds[0] : null;
        setFocusedConversationIdState((prev) => {
          if (prev === null) {
            saveToStorage(STORAGE_KEYS.focusedConversation, firstOpen);
            return firstOpen;
          }
          return prev;
        });
        return currentOpenIds; // Don't modify openConversationIds
      });
      return;
    }
    
    setOpenConversationIdsState((prev) => {
      const next = prev.filter((cid) => cid !== id);
      saveToStorage(STORAGE_KEYS.openConversations, next);
      
      // If closing the focused conversation, focus the first remaining one
      setFocusedConversationIdState((prevFocused) => {
        if (prevFocused === id) {
          const newFocus = next.length > 0 ? next[0] : null;
          saveToStorage(STORAGE_KEYS.focusedConversation, newFocus);
          return newFocus;
        }
        return prevFocused;
      });
      
      return next;
    });
  }, []);

  // Focus a conversation (must already be open)
  const focusConversation = useCallback((id: string | null) => {
    setFocusedConversationIdState(id);
    saveToStorage(STORAGE_KEYS.focusedConversation, id);
  }, []);

  // Direct setter for openConversationIds (for archive handling etc.)
  const setOpenConversationIds = useCallback((ids: string[]) => {
    setOpenConversationIdsState(ids);
    saveToStorage(STORAGE_KEYS.openConversations, ids);
  }, []);

  // Maximize a conversation (show it in 1x1 mode temporarily)
  const maximizeConversation = useCallback((id: string) => {
    setMaximizedConversationId(id);
    setFocusedConversationIdState(id);
    saveToStorage(STORAGE_KEYS.focusedConversation, id);
  }, []);

  // Restore from maximized state
  const restoreFromMaximized = useCallback(() => {
    setMaximizedConversationId(null);
  }, []);

  // Bring a conversation to the front of the list
  const bringToFront = useCallback((id: string) => {
    setOpenConversationIdsState((prev) => {
      if (!prev.includes(id)) return prev;
      const next = [id, ...prev.filter((cid) => cid !== id)];
      saveToStorage(STORAGE_KEYS.openConversations, next);
      return next;
    });
    setFocusedConversationIdState(id);
    saveToStorage(STORAGE_KEYS.focusedConversation, id);
  }, []);

  // Open a new conversation pane (null represents new conversation)
  const openNewConversation = useCallback(() => {
    setHasNewPane(true);
    setFocusedConversationIdState(null);
    saveToStorage(STORAGE_KEYS.focusedConversation, null);
  }, []);

  // Close the new conversation pane
  const closeNewPane = useCallback(() => {
    setHasNewPane(false);
    // If currently focused on new pane, focus first open conversation
    setFocusedConversationIdState((prev) => {
      if (prev === null) {
        const firstOpen = openConversationIds.length > 0 ? openConversationIds[0] : null;
        saveToStorage(STORAGE_KEYS.focusedConversation, firstOpen);
        return firstOpen;
      }
      return prev;
    });
  }, [openConversationIds]);

  return [
    { columnCount, rowCount, openConversationIds, focusedConversationId, maximizedConversationId, hasNewPane },
    { setColumnCount, setRowCount, openConversation, closeConversation, focusConversation, setOpenConversationIds, maximizeConversation, restoreFromMaximized, bringToFront, openNewConversation, closeNewPane },
  ];
}
