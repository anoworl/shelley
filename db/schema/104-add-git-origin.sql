-- Add git_origin column to track the git remote origin URL for grouping conversations
ALTER TABLE conversations ADD COLUMN git_origin TEXT;

-- Index on git_origin for grouping queries
CREATE INDEX idx_conversations_git_origin ON conversations(git_origin);
