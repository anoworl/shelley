package server

import (
	"context"
	"encoding/json"
	"fmt"

	"shelley.exe.dev/db"
	"shelley.exe.dev/db/generated"
	"shelley.exe.dev/llm"
)

// recoverInterruptedConversations finds conversations that were interrupted
// by server shutdown and resumes them.
func (s *Server) recoverInterruptedConversations(ctx context.Context) {
	s.logger.Info("Checking for interrupted conversations to recover")

	// Get all non-archived conversations
	// We check all of them because the agent_working DB flag may be stale
	var conversations []generated.Conversation
	err := s.db.Queries(ctx, func(q *generated.Queries) error {
		var err error
		// Get recent conversations (limit to 100 to avoid loading too many)
		conversations, err = q.ListConversations(ctx, generated.ListConversationsParams{
			Limit:  100,
			Offset: 0,
		})
		return err
	})
	if err != nil {
		s.logger.Error("Failed to list conversations for recovery", "error", err)
		return
	}

	recoveredCount := 0
	for _, conv := range conversations {
		// Skip archived conversations
		if conv.Archived {
			continue
		}

		// Get messages for this conversation to check if agent was working
		var messages []generated.Message
		err := s.db.Queries(ctx, func(q *generated.Queries) error {
			var err error
			messages, err = q.ListMessages(ctx, conv.ConversationID)
			return err
		})
		if err != nil {
			s.logger.Error("Failed to list messages for recovery", "error", err, "conversationID", conv.ConversationID)
			continue
		}

		// Check with agentWorking() - this is the source of truth
		apiMessages := toAPIMessages(messages)
		if !agentWorking(apiMessages) {
			continue
		}

		s.logger.Info("Found interrupted conversation", "conversationID", conv.ConversationID, "slug", conv.Slug)

		// Recover in a goroutine so we don't block server startup
		go s.recoverConversation(context.Background(), conv, messages)
		recoveredCount++
	}

	if recoveredCount > 0 {
		s.logger.Info("Started recovery for interrupted conversations", "count", recoveredCount)
	} else {
		s.logger.Info("No interrupted conversations found")
	}
}

// recoverConversation resumes a single interrupted conversation.
func (s *Server) recoverConversation(ctx context.Context, conv generated.Conversation, messages []generated.Message) {
	logger := s.logger.With("conversationID", conv.ConversationID)

	// First, record error tool_results for any incomplete tool calls
	if err := s.recordMissingToolResultsForRecovery(ctx, conv.ConversationID, messages); err != nil {
		logger.Error("Failed to record missing tool results", "error", err)
		return
	}

	// Use default model since we don't store model per conversation
	modelID := s.defaultModel

	// Get the LLM service
	service, err := s.llmManager.GetService(modelID)
	if err != nil {
		logger.Error("Failed to get LLM service for recovery", "error", err, "model", modelID)
		return
	}

	// Get or create the conversation manager
	manager, err := s.getOrCreateConversationManager(ctx, conv.ConversationID)
	if err != nil {
		logger.Error("Failed to create conversation manager for recovery", "error", err)
		return
	}

	// Resume the conversation
	if err := manager.Resume(ctx, service, modelID); err != nil {
		logger.Error("Failed to resume conversation", "error", err)
		return
	}

	logger.Info("Successfully initiated recovery for conversation")
}

// recordMissingToolResultsForRecovery checks if the last assistant message has
// tool_use blocks without corresponding tool_results, and records error results.
func (s *Server) recordMissingToolResultsForRecovery(ctx context.Context, conversationID string, messages []generated.Message) error {
	if len(messages) == 0 {
		return nil
	}

	// Find the last assistant message with tool_use
	var lastAssistantMsg *generated.Message
	var lastAssistantIdx int
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Type == string(db.MessageTypeAgent) {
			lastAssistantMsg = &messages[i]
			lastAssistantIdx = i
			break
		}
	}

	if lastAssistantMsg == nil || lastAssistantMsg.LlmData == nil {
		return nil
	}

	// Parse the assistant message to find tool_use blocks
	var assistantLLMMsg llm.Message
	if err := json.Unmarshal([]byte(*lastAssistantMsg.LlmData), &assistantLLMMsg); err != nil {
		return fmt.Errorf("failed to parse assistant message: %w", err)
	}

	// Collect tool_use IDs from the assistant message
	toolUseIDs := make(map[string]string) // id -> name
	for _, content := range assistantLLMMsg.Content {
		if content.Type == llm.ContentTypeToolUse {
			toolUseIDs[content.ID] = content.ToolName
		}
	}

	if len(toolUseIDs) == 0 {
		return nil
	}

	// Check messages after the assistant message for tool_results
	for i := lastAssistantIdx + 1; i < len(messages); i++ {
		msg := messages[i]
		if msg.Type != string(db.MessageTypeUser) || msg.LlmData == nil {
			continue
		}

		var userLLMMsg llm.Message
		if err := json.Unmarshal([]byte(*msg.LlmData), &userLLMMsg); err != nil {
			continue
		}

		for _, content := range userLLMMsg.Content {
			if content.Type == llm.ContentTypeToolResult {
				delete(toolUseIDs, content.ToolUseID)
			}
		}
	}

	// If there are still tool_use IDs without results, record error results
	if len(toolUseIDs) == 0 {
		return nil
	}

	s.logger.Info("Recording error tool results for interrupted tools",
		"conversationID", conversationID,
		"count", len(toolUseIDs))

	var toolResults []llm.Content
	for id, name := range toolUseIDs {
		toolResults = append(toolResults, llm.Content{
			Type:      llm.ContentTypeToolResult,
			ToolUseID: id,
			ToolError: true,
			ToolResult: []llm.Content{{
				Type: llm.ContentTypeText,
				Text: fmt.Sprintf("Tool '%s' execution was interrupted by server restart. The operation may or may not have completed. Please check the current state and retry if needed.", name),
			}},
		})
	}

	errorMessage := llm.Message{
		Role:    llm.MessageRoleUser,
		Content: toolResults,
	}

	_, err := s.db.CreateMessage(ctx, db.CreateMessageParams{
		ConversationID: conversationID,
		Type:           db.MessageTypeUser,
		LLMData:        errorMessage,
		UsageData:      llm.Usage{},
	})

	return err
}
