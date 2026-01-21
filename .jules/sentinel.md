## 2025-05-27 - Path Traversal in File Serving Handler
**Vulnerability:** A path traversal vulnerability was found in `handleRead` in `server/handlers.go`. The handler accepted a `path` query parameter and checked if it started with a specific allowed directory prefix using `strings.HasPrefix`. However, it did not clean the path before this check, allowing attackers to use `../` sequences to traverse out of the allowed directory after the prefix match (e.g., `/allowed/../etc/passwd`).
**Learning:** `strings.HasPrefix` is insufficient for validating file paths when user input can contain `..` or other traversal characters. The path must be canonicalized before validation.
**Prevention:** Always use `filepath.Clean()` (or `filepath.Abs()` if dealing with absolute paths) to resolve directory traversal sequences before performing any prefix checks or access control logic. Ensure the prefix check includes a trailing separator to prevent partial name matching (e.g., `/tmp/dir` matching `/tmp/directory`).

## 2026-01-21 - Unrestricted File Upload Stored XSS (REJECTED)
**Vulnerability:** The `handleUpload` function in `server/handlers.go` allowed uploading files with any extension. The `handleRead` function then served these files, setting the `Content-Type` header based on the extension or content sniffing. This allowed an attacker to upload an HTML file containing malicious scripts (Stored XSS) which would be executed when a user viewed the file via `handleRead`.
**Learning:** Even if filenames are randomized, preserving the original file extension without validation allows attackers to control the MIME type of the served content.
**Status:** REJECTED. The maintainers clarified that this is a single-user application with no external input, so this requires the user to attack themselves (Self-XSS), which is not considered a valid threat model for this project.
**Prevention:** In multi-user systems, implement a strict allowlist of file extensions.
