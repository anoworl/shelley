-- Add model_id column to conversations
-- Stores the Shelley model ID (e.g., "claude-opus-4.5") used for this conversation
-- NULL for conversations created before this migration (will use default model)

ALTER TABLE conversations ADD COLUMN model_id TEXT;
