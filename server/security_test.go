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

// MockServer creates a minimal server for testing handleWriteFile
func MockServer() *Server {
	return &Server{}
}

func TestHandleWriteFile_Vulnerability(t *testing.T) {
	s := MockServer()

	// Create a temporary directory OUTSIDE any git repo
	tmpDir, err := os.MkdirTemp("", "sentinel-exploit")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	targetFile := filepath.Join(tmpDir, "exploit.txt")
	content := "PWNED"

	reqBody, _ := json.Marshal(map[string]string{
		"path":    targetFile,
		"content": content,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/write-file", bytes.NewBuffer(reqBody))
	w := httptest.NewRecorder()

	s.handleWriteFile(w, req)

	if w.Code == http.StatusForbidden {
		t.Logf("PASS: Write correctly blocked with status 403 Forbidden")
	} else if w.Code == http.StatusOK {
		t.Errorf("FAIL: Write succeeded despite being outside git repo!")
	} else {
		t.Logf("Write failed with status %d (acceptable)", w.Code)
	}
}

func TestHandleWriteFile_Legitimate(t *testing.T) {
	s := MockServer()

	// Create a temp directory for the git repo
	repoDir, err := os.MkdirTemp("", "sentinel-legit-repo")
	if err != nil {
		t.Fatalf("Failed to create temp repo dir: %v", err)
	}
	defer os.RemoveAll(repoDir)

	// Initialize git repo
	cmd := exec.Command("git", "init")
	cmd.Dir = repoDir
	if err := cmd.Run(); err != nil {
		t.Fatalf("Failed to init git repo: %v", err)
	}

	// Create a file inside the repo
	targetFile := filepath.Join(repoDir, "test-file.txt")
	content := "UPDATED CONTENT"

	// We need to create the file first or at least ensure the dir exists
	// handleWriteFile uses os.WriteFile which creates the file if it doesn't exist,
	// but fails if the directory doesn't exist. repoDir exists.

	reqBody, _ := json.Marshal(map[string]string{
		"path":    targetFile,
		"content": content,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/write-file", bytes.NewBuffer(reqBody))
	w := httptest.NewRecorder()

	s.handleWriteFile(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Legitimate write failed with status %d: %s", w.Code, w.Body.String())
	}
}

func TestHandleWriteFile_GitDirProtection(t *testing.T) {
	s := MockServer()

	// Create a temp directory for the git repo
	repoDir, err := os.MkdirTemp("", "sentinel-git-protection")
	if err != nil {
		t.Fatalf("Failed to create temp repo dir: %v", err)
	}
	defer os.RemoveAll(repoDir)

	// Initialize git repo (so we satisfy the IsRepo check)
	cmd := exec.Command("git", "init")
	cmd.Dir = repoDir
	if err := cmd.Run(); err != nil {
		t.Fatalf("Failed to init git repo: %v", err)
	}

	// Try to write to .git/config (should fail)
	targetFile := filepath.Join(repoDir, ".git", "config-hacked")

	content := "hacked"
	reqBody, _ := json.Marshal(map[string]string{
		"path":    targetFile,
		"content": content,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/write-file", bytes.NewBuffer(reqBody))
	w := httptest.NewRecorder()

	s.handleWriteFile(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("Write to .git directory should be forbidden, got %d", w.Code)
	}
}
