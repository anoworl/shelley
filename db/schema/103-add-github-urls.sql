-- Add github_urls column to store linked PR/issue URLs as JSON array
ALTER TABLE conversations ADD COLUMN github_urls TEXT;
