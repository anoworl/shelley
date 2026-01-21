-- Add context_window_size column to track current context window usage
ALTER TABLE conversations ADD COLUMN context_window_size INTEGER NOT NULL DEFAULT 0;
