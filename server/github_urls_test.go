package server

import (
	"testing"

	"shelley.exe.dev/llm"
)

func TestExtractGitHubURLs(t *testing.T) {
	tests := []struct {
		name     string
		message  llm.Message
		expected []string
	}{
		{
			name: "text content with PR URL",
			message: llm.Message{
				Role: llm.MessageRoleUser,
				Content: []llm.Content{
					{Type: llm.ContentTypeText, Text: "Please review https://github.com/anoworl/shelley/pull/24"},
				},
			},
			expected: []string{"https://github.com/anoworl/shelley/pull/24"},
		},
		{
			name: "text content with issue URL",
			message: llm.Message{
				Role: llm.MessageRoleUser,
				Content: []llm.Content{
					{Type: llm.ContentTypeText, Text: "Fix https://github.com/anoworl/shelley/issues/19"},
				},
			},
			expected: []string{"https://github.com/anoworl/shelley/issues/19"},
		},
		{
			name: "multiple URLs",
			message: llm.Message{
				Role: llm.MessageRoleUser,
				Content: []llm.Content{
					{Type: llm.ContentTypeText, Text: "See https://github.com/anoworl/shelley/pull/24 and https://github.com/anoworl/shelley/issues/19"},
				},
			},
			expected: []string{"https://github.com/anoworl/shelley/pull/24", "https://github.com/anoworl/shelley/issues/19"},
		},
		{
			name: "tool result with gh pr create output",
			message: llm.Message{
				Role: llm.MessageRoleUser,
				Content: []llm.Content{
					{
						Type: llm.ContentTypeToolResult,
						ToolResult: []llm.Content{
							{Type: llm.ContentTypeText, Text: "https://github.com/anoworl/shelley/pull/25"},
						},
					},
				},
			},
			expected: []string{"https://github.com/anoworl/shelley/pull/25"},
		},
		{
			name: "no URLs",
			message: llm.Message{
				Role: llm.MessageRoleUser,
				Content: []llm.Content{
					{Type: llm.ContentTypeText, Text: "Hello world"},
				},
			},
			expected: nil,
		},
		{
			name: "duplicate URLs",
			message: llm.Message{
				Role: llm.MessageRoleUser,
				Content: []llm.Content{
					{Type: llm.ContentTypeText, Text: "https://github.com/anoworl/shelley/pull/24 https://github.com/anoworl/shelley/pull/24"},
				},
			},
			expected: []string{"https://github.com/anoworl/shelley/pull/24"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractGitHubURLs(tt.message)
			if len(result) != len(tt.expected) {
				t.Errorf("expected %d URLs, got %d: %v", len(tt.expected), len(result), result)
				return
			}
			for i, url := range result {
				if url != tt.expected[i] {
					t.Errorf("expected URL[%d] = %q, got %q", i, tt.expected[i], url)
				}
			}
		})
	}
}

func TestParseGitHubRepo(t *testing.T) {
	tests := []struct {
		name      string
		remoteURL string
		expected  string
	}{
		{
			name:      "HTTPS with .git",
			remoteURL: "https://github.com/anoworl/shelley.git",
			expected:  "anoworl/shelley",
		},
		{
			name:      "HTTPS without .git",
			remoteURL: "https://github.com/anoworl/shelley",
			expected:  "anoworl/shelley",
		},
		{
			name:      "SSH format",
			remoteURL: "git@github.com:anoworl/shelley.git",
			expected:  "anoworl/shelley",
		},
		{
			name:      "non-GitHub URL",
			remoteURL: "https://gitlab.com/user/repo.git",
			expected:  "",
		},
		{
			name:      "empty",
			remoteURL: "",
			expected:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseGitHubRepo(tt.remoteURL)
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestFilterURLsByRepo(t *testing.T) {
	tests := []struct {
		name     string
		urls     []string
		repo     string
		expected []string
	}{
		{
			name:     "matching repo",
			urls:     []string{"https://github.com/anoworl/shelley/pull/24"},
			repo:     "anoworl/shelley",
			expected: []string{"https://github.com/anoworl/shelley/pull/24"},
		},
		{
			name:     "non-matching repo",
			urls:     []string{"https://github.com/other/repo/pull/1"},
			repo:     "anoworl/shelley",
			expected: nil,
		},
		{
			name:     "mixed repos",
			urls:     []string{"https://github.com/anoworl/shelley/pull/24", "https://github.com/other/repo/pull/1"},
			repo:     "anoworl/shelley",
			expected: []string{"https://github.com/anoworl/shelley/pull/24"},
		},
		{
			name:     "empty repo",
			urls:     []string{"https://github.com/anoworl/shelley/pull/24"},
			repo:     "",
			expected: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := filterURLsByRepo(tt.urls, tt.repo)
			if len(result) != len(tt.expected) {
				t.Errorf("expected %d URLs, got %d: %v", len(tt.expected), len(result), result)
				return
			}
			for i, url := range result {
				if url != tt.expected[i] {
					t.Errorf("expected URL[%d] = %q, got %q", i, tt.expected[i], url)
				}
			}
		})
	}
}
