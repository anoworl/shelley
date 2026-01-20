// Compute which conversation IDs to display in the pane grid
export function computeDisplayIds(
  columnCount: number,
  rowCount: number,
  openConversationIds: string[],
  focusedConversationId: string | null,
  maximizedConversationId: string | null,
  hasNewPane: boolean = false
): (string | null)[] {
  const isMaximized = maximizedConversationId !== null;
  const isSinglePaneMode = (columnCount === 1 && rowCount === 1) || isMaximized;
  const maxPanes = isMaximized ? 1 : columnCount * rowCount;

  if (isMaximized) {
    return [maximizedConversationId];
  }
  
  if (isSinglePaneMode) {
    // In single pane mode, show focused or new pane
    if (focusedConversationId !== null) {
      return [focusedConversationId];
    }
    return [null];
  }
  
  // Multi-pane mode: combine existing conversations with new pane if open
  let result: (string | null)[] = [...openConversationIds];
  
  // Add new pane if hasNewPane is true
  if (hasNewPane) {
    // Reserve a slot for new pane by trimming existing conversations if needed
    if (result.length >= maxPanes) {
      result = result.slice(0, maxPanes - 1);
    }
    result.push(null);
  }
  
  // If nothing open, show at least a new pane
  if (result.length === 0) {
    result.push(null);
  }
  
  return result.slice(0, maxPanes);
}
