-- Add agent_working column to track if the agent is currently working
ALTER TABLE conversations ADD COLUMN agent_working BOOLEAN NOT NULL DEFAULT FALSE;
