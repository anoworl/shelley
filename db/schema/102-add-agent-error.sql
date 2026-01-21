-- Add agent_error column to track if the conversation ended with an error
ALTER TABLE conversations ADD COLUMN agent_error BOOLEAN NOT NULL DEFAULT FALSE;
