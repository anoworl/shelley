package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestHandleWriteFile_PathTraversal(t *testing.T) {
	// Create a temporary directory for the test
	tempDir, err := os.MkdirTemp("", "sentinel-test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Create a file *outside* any git repo
	targetFile := filepath.Join(tempDir, "pwned.txt")

	// Create a minimal server instance.
	s := &Server{}

	reqBody := map[string]string{
		"path":    targetFile,
		"content": "hacked",
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/write-file", bytes.NewReader(bodyBytes))
	w := httptest.NewRecorder()

	// Call the handler
	s.handleWriteFile(w, req)

	// Check response code - SHOULD BE 403 Forbidden now
	if w.Code != http.StatusForbidden {
		t.Errorf("Expected status Forbidden (403), got %v. Body: %s", w.Code, w.Body.String())
	}

	// Verify file was NOT written
	if _, err := os.Stat(targetFile); !os.IsNotExist(err) {
		t.Errorf("Target file %s should NOT exist", targetFile)
	}
}

func TestHandleWriteFile_ValidGitRepo(t *testing.T) {
	// Create a temporary directory that IS a git repo
	tempDir, err := os.MkdirTemp("", "sentinel-test-git")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Initialize git repo
	cmd := exec.Command("git", "init")
	cmd.Dir = tempDir
	if err := cmd.Run(); err != nil {
		t.Fatalf("Failed to init git repo: %v", err)
	}

    // Configure git user email and name to allow commits (if needed, though we just need it to be a repo)
    exec.Command("git", "-C", tempDir, "config", "user.email", "you@example.com").Run()
    exec.Command("git", "-C", tempDir, "config", "user.name", "Your Name").Run()

	targetFile := filepath.Join(tempDir, "allowed.txt")

	s := &Server{}
	reqBody := map[string]string{
		"path":    targetFile,
		"content": "allowed",
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/write-file", bytes.NewReader(bodyBytes))
	w := httptest.NewRecorder()

	s.handleWriteFile(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %v. Body: %s", w.Code, w.Body.String())
	}

	content, err := os.ReadFile(targetFile)
	if err != nil {
		t.Fatalf("Failed to read allowed file: %v", err)
	}
	if string(content) != "allowed" {
		t.Errorf("Expected content 'allowed', got '%s'", string(content))
	}
}

func TestHandleWriteFile_BlockGitDir(t *testing.T) {
	// Create a temporary directory that IS a git repo
	tempDir, err := os.MkdirTemp("", "sentinel-test-git-block")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Initialize git repo
	cmd := exec.Command("git", "init")
	cmd.Dir = tempDir
	if err := cmd.Run(); err != nil {
		t.Fatalf("Failed to init git repo: %v", err)
	}

	// Try to write to .git/config
	targetFile := filepath.Join(tempDir, ".git", "config")

	s := &Server{}
	reqBody := map[string]string{
		"path":    targetFile,
		"content": "[core]\n\trepositoryformatversion = 0",
	}
	bodyBytes, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/write-file", bytes.NewReader(bodyBytes))
	w := httptest.NewRecorder()

	s.handleWriteFile(w, req)

	// Should be blocked
	if w.Code != http.StatusForbidden {
		t.Errorf("Expected status Forbidden (403) for writing to .git dir, got %v. Body: %s", w.Code, w.Body.String())
	}
}
