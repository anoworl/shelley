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

func TestHandleWriteFile_Security(t *testing.T) {
	// Setup: Create a temp directory
	tempDir, err := os.MkdirTemp("", "sentinel_security_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// 1. Test writing outside a git repo (Now ALLOWED by design, but checking for non-crash)
	t.Run("WriteOutsideGitRepo", func(t *testing.T) {
		targetPath := filepath.Join(tempDir, "outside.txt")
		payload := map[string]string{
			"path":    targetPath,
			"content": "allowed content",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/write-file", bytes.NewReader(body))
		w := httptest.NewRecorder()

		s := &Server{}
		s.handleWriteFile(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected OK (200), got %d. Body: %s", resp.StatusCode, w.Body.String())
		}

        content, _ := os.ReadFile(targetPath)
        if string(content) != "allowed content" {
            t.Errorf("Content mismatch")
        }
	})

	// Setup: Create a git repo inside the temp dir
	repoDir := filepath.Join(tempDir, "repo")
	if err := os.Mkdir(repoDir, 0755); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command("git", "init")
	cmd.Dir = repoDir
	if err := cmd.Run(); err != nil {
		t.Fatal("Failed to init git repo:", err)
	}

    // Config user for git commits if needed
    exec.Command("git", "-C", repoDir, "config", "user.email", "you@example.com").Run()
    exec.Command("git", "-C", repoDir, "config", "user.name", "Your Name").Run()

	// 2. Test writing inside a git repo (valid)
	t.Run("WriteInsideGitRepo", func(t *testing.T) {
		targetPath := filepath.Join(repoDir, "valid.txt")
		payload := map[string]string{
			"path":    targetPath,
			"content": "valid content",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/write-file", bytes.NewReader(body))
		w := httptest.NewRecorder()

		s := &Server{}
		s.handleWriteFile(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected OK (200), got %d. Body: %s", resp.StatusCode, w.Body.String())
		}

		content, err := os.ReadFile(targetPath)
		if err != nil {
			t.Errorf("Failed to read file: %v", err)
		} else if string(content) != "valid content" {
			t.Errorf("Unexpected content: %s", string(content))
		}
	})

	// 3. Test writing to .git directory (should fail)
	t.Run("WriteToGitDir", func(t *testing.T) {
		targetPath := filepath.Join(repoDir, ".git", "config_hacked")
		payload := map[string]string{
			"path":    targetPath,
			"content": "hacked",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/write-file", bytes.NewReader(body))
		w := httptest.NewRecorder()

		s := &Server{}
		s.handleWriteFile(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("Expected Forbidden (403), got %d", resp.StatusCode)
		}
	})

    // 4. Test writing with .git in path but deeper (should fail)
    t.Run("WriteToGitSubDir", func(t *testing.T) {
		targetPath := filepath.Join(repoDir, ".git", "refs", "heads", "hacked")
		payload := map[string]string{
			"path":    targetPath,
			"content": "hacked",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/write-file", bytes.NewReader(body))
		w := httptest.NewRecorder()

		s := &Server{}
		s.handleWriteFile(w, req)

		resp := w.Result()
		if resp.StatusCode != http.StatusForbidden {
			t.Errorf("Expected Forbidden (403), got %d", resp.StatusCode)
		}
	})
}
