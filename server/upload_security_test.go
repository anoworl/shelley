package server

import (
	"bytes"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"shelley.exe.dev/claudetool"
	"shelley.exe.dev/loop"
)

func TestUploadMaliciousExtensions(t *testing.T) {
	database, cleanup := setupTestDB(t)
	defer cleanup()

	predictableService := loop.NewPredictableService()
	llmManager := &testLLMManager{service: predictableService}
	logger := slog.Default()
	server := NewServer(database, llmManager, claudetool.ToolSetConfig{}, logger, true, "", "predictable", "", nil)

	testCases := []struct {
		filename string
		content  string
		mimeType string
	}{
		{"exploit.html", "<html><script>alert(1)</script></html>", "text/html"},
		{"script.sh", "#!/bin/bash\necho pwned", "text/plain"}, // DetectContentType might say text/plain
		{"binary.exe", "MZ9000", "application/octet-stream"},
	}

	for _, tc := range testCases {
		t.Run(tc.filename, func(t *testing.T) {
			body := &bytes.Buffer{}
			writer := multipart.NewWriter(body)

			part, err := writer.CreateFormFile("file", tc.filename)
			if err != nil {
				t.Fatalf("failed to create form file: %v", err)
			}
			part.Write([]byte(tc.content))
			writer.Close()

			req := httptest.NewRequest("POST", "/api/upload", body)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			w := httptest.NewRecorder()

			server.handleUpload(w, req)

			// Verify security fix: This should now FAIL with 400 Bad Request
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected status 400 (security check), got %d", w.Code)
			}
		})
	}
}
