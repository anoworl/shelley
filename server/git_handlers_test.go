package server

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"shelley.exe.dev/claudetool"
	"shelley.exe.dev/loop"
)

func TestGitDiffFiles_ArgumentInjection(t *testing.T) {
	// Setup git repo
	tmpDir, err := os.MkdirTemp("", "git-test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Init git
	exec.Command("git", "init", tmpDir).Run()
	exec.Command("git", "-C", tmpDir, "config", "user.email", "you@example.com").Run()
	exec.Command("git", "-C", tmpDir, "config", "user.name", "Your Name").Run()

	// Create a file and commit
	os.WriteFile(filepath.Join(tmpDir, "test.txt"), []byte("hello"), 0644)
	exec.Command("git", "-C", tmpDir, "add", "test.txt").Run()
	exec.Command("git", "-C", tmpDir, "commit", "-m", "initial").Run()

	// Second commit so HEAD^ works
	os.WriteFile(filepath.Join(tmpDir, "test.txt"), []byte("hello world"), 0644)
	exec.Command("git", "-C", tmpDir, "add", "test.txt").Run()
	exec.Command("git", "-C", tmpDir, "commit", "-m", "second").Run()

	// Setup Server
	database, cleanup := setupTestDB(t)
	defer cleanup()

	predictableService := loop.NewPredictableService()
	llmManager := &testLLMManager{service: predictableService}
	logger := slog.Default()
	server := NewServer(database, llmManager, claudetool.ToolSetConfig{}, logger, true, "", "predictable", "", nil)

	// Helper to request
	request := func(diffID string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/api/git/diffs/"+diffID+"/files?cwd="+tmpDir, nil)
		w := httptest.NewRecorder()
		server.handleGitDiffFiles(w, req)
		return w
	}

	// 1. Valid ID (HEAD) - should currently work (200 OK)
	// HEAD is a valid revision, but our validation will restrict to hex hashes or "working".
	// So if we make validation strict, HEAD might be rejected if we only allow hex.
	// But let's check what the frontend sends. Usually it sends hashes.
	// "working" is also sent.
	// For this test, let's assume we want to restrict to hex only (and "working").
	// So "HEAD" should technically be rejected by our strict validation?
	// If the frontend relies on HEAD, we might break it.
	// But handleGitDiffs sends hashes.

	// Let's get the hash of the second commit
	out, _ := exec.Command("git", "-C", tmpDir, "rev-parse", "HEAD").Output()
	headHash := string(out[:len(out)-1]) // trim newline

	w := request(headHash)
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200 OK for valid hash, got %d. Body: %s", w.Code, w.Body.String())
	}

	wWorking := request("working")
	if wWorking.Code != http.StatusOK {
		t.Errorf("Expected 200 OK for 'working', got %d. Body: %s", wWorking.Code, wWorking.Body.String())
	}

	// 2. Invalid ID (argument injection attempt)
	// We pass something that looks like a flag
	wHelp := request("--help")

	// Currently (before fix), this likely returns 500 because git fails.
	// After fix, it should return 400 Bad Request.
	if wHelp.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request for invalid diffID '--help', got %d", wHelp.Code)
	}

	// 3. Invalid characters
	wInvalid := request("validhash;rm-rf")
	if wInvalid.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request for invalid chars, got %d", wInvalid.Code)
	}
}

func TestGitFileDiff_ArgumentInjection(t *testing.T) {
	// Setup git repo
	tmpDir, err := os.MkdirTemp("", "git-test-file")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	exec.Command("git", "init", tmpDir).Run()
	exec.Command("git", "-C", tmpDir, "config", "user.email", "you@example.com").Run()
	exec.Command("git", "-C", tmpDir, "config", "user.name", "Your Name").Run()

	os.WriteFile(filepath.Join(tmpDir, "test.txt"), []byte("hello"), 0644)
	exec.Command("git", "-C", tmpDir, "add", "test.txt").Run()
	exec.Command("git", "-C", tmpDir, "commit", "-m", "initial").Run()

	os.WriteFile(filepath.Join(tmpDir, "test.txt"), []byte("hello world"), 0644)
	exec.Command("git", "-C", tmpDir, "add", "test.txt").Run()
	exec.Command("git", "-C", tmpDir, "commit", "-m", "second").Run()

	database, cleanup := setupTestDB(t)
	defer cleanup()

	predictableService := loop.NewPredictableService()
	llmManager := &testLLMManager{service: predictableService}
	logger := slog.Default()
	server := NewServer(database, llmManager, claudetool.ToolSetConfig{}, logger, true, "", "predictable", "", nil)

	// Helper
	request := func(diffID, filePath string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/api/git/file-diff/"+diffID+"/"+filePath+"?cwd="+tmpDir, nil)
		w := httptest.NewRecorder()
		server.handleGitFileDiff(w, req)
		return w
	}

	// Invalid ID
	w := request("--help", "test.txt")
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request for invalid diffID, got %d", w.Code)
	}
}
