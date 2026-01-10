package server

import (
	"context"
	"encoding/json"
	"os/exec"
	"regexp"
	"strings"

	"shelley.exe.dev/db/generated"
	"shelley.exe.dev/llm"
)

var githubURLPattern = regexp.MustCompile(`https://github\.com/([^/]+/[^/]+)/(issues|pull)/(\d+)`)

// extractGitHubURLs extracts GitHub issue/PR URLs from message content
func extractGitHubURLs(message llm.Message) []string {
	var urls []string
	seen := make(map[string]bool)

	for _, content := range message.Content {
		var text string
		switch content.Type {
		case llm.ContentTypeText:
			text = content.Text
		case llm.ContentTypeToolResult:
			// Tool results may contain URLs (e.g., gh pr create output)
			for _, result := range content.ToolResult {
				if result.Type == llm.ContentTypeText {
					text += result.Text + "\n"
				}
			}
		}

		matches := githubURLPattern.FindAllString(text, -1)
		for _, url := range matches {
			if !seen[url] {
				seen[url] = true
				urls = append(urls, url)
			}
		}
	}

	return urls
}

// getRepoFromCwd gets the GitHub repo (owner/repo) from a directory's git remote
func getRepoFromCwd(cwd string) string {
	if cwd == "" {
		return ""
	}

	cmd := exec.Command("git", "config", "--get", "remote.origin.url")
	cmd.Dir = cwd
	output, err := cmd.Output()
	if err != nil {
		return ""
	}

	remoteURL := strings.TrimSpace(string(output))
	return parseGitHubRepo(remoteURL)
}

// parseGitHubRepo extracts owner/repo from a GitHub remote URL
// Supports both HTTPS and SSH formats:
//   - https://github.com/owner/repo.git
//   - git@github.com:owner/repo.git
func parseGitHubRepo(remoteURL string) string {
	// HTTPS format
	if strings.Contains(remoteURL, "github.com/") {
		parts := strings.Split(remoteURL, "github.com/")
		if len(parts) == 2 {
			repo := strings.TrimSuffix(parts[1], ".git")
			repo = strings.TrimSuffix(repo, "/")
			return repo
		}
	}

	// SSH format
	if strings.Contains(remoteURL, "github.com:") {
		parts := strings.Split(remoteURL, "github.com:")
		if len(parts) == 2 {
			repo := strings.TrimSuffix(parts[1], ".git")
			repo = strings.TrimSuffix(repo, "/")
			return repo
		}
	}

	return ""
}

// filterURLsByRepo filters URLs to only include those matching the given repo
func filterURLsByRepo(urls []string, repo string) []string {
	if repo == "" {
		return nil
	}

	var filtered []string
	for _, url := range urls {
		matches := githubURLPattern.FindStringSubmatch(url)
		if len(matches) >= 2 && matches[1] == repo {
			filtered = append(filtered, url)
		}
	}
	return filtered
}

// updateGitHubURLs extracts GitHub URLs from message and updates the conversation
func (s *Server) updateGitHubURLs(ctx context.Context, conversationID string, cwd string, message llm.Message) {
	// Extract URLs from message
	newURLs := extractGitHubURLs(message)
	if len(newURLs) == 0 {
		return
	}

	// Get repo from cwd
	repo := getRepoFromCwd(cwd)

	// Filter to only URLs matching this repo
	newURLs = filterURLsByRepo(newURLs, repo)
	if len(newURLs) == 0 {
		return
	}

	// Get existing URLs
	convo, err := s.db.GetConversationByID(ctx, conversationID)
	if err != nil {
		s.logger.Warn("Failed to get conversation for GitHub URL update", "error", err)
		return
	}

	var existingURLs []string
	if convo.GithubUrls != nil && *convo.GithubUrls != "" {
		if err := json.Unmarshal([]byte(*convo.GithubUrls), &existingURLs); err != nil {
			s.logger.Warn("Failed to parse existing GitHub URLs", "error", err)
		}
	}

	// Merge URLs (dedupe)
	seen := make(map[string]bool)
	for _, url := range existingURLs {
		seen[url] = true
	}

	var mergedURLs []string
	mergedURLs = append(mergedURLs, existingURLs...)
	for _, url := range newURLs {
		if !seen[url] {
			seen[url] = true
			mergedURLs = append(mergedURLs, url)
		}
	}

	// Only update if we have new URLs
	if len(mergedURLs) == len(existingURLs) {
		return
	}

	// Save to DB
	urlsJSON, err := json.Marshal(mergedURLs)
	if err != nil {
		s.logger.Warn("Failed to marshal GitHub URLs", "error", err)
		return
	}

	urlsStr := string(urlsJSON)
	if err := s.db.QueriesTx(ctx, func(q *generated.Queries) error {
		return q.UpdateConversationGitHubUrls(ctx, generated.UpdateConversationGitHubUrlsParams{
			GithubUrls:     &urlsStr,
			ConversationID: conversationID,
		})
	}); err != nil {
		s.logger.Warn("Failed to update GitHub URLs", "error", err)
		return
	}

	s.logger.Info("Updated GitHub URLs", "conversation_id", conversationID, "urls", mergedURLs)

	// Notify clients of the metadata change
	s.broadcastConversationUpdate(ctx, conversationID)
}
