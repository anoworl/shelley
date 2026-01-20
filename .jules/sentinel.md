## 2025-05-27 - Path Traversal in File Serving Handler
**Vulnerability:** A path traversal vulnerability was found in `handleRead` in `server/handlers.go`. The handler accepted a `path` query parameter and checked if it started with a specific allowed directory prefix using `strings.HasPrefix`. However, it did not clean the path before this check, allowing attackers to use `../` sequences to traverse out of the allowed directory after the prefix match (e.g., `/allowed/../etc/passwd`).
**Learning:** `strings.HasPrefix` is insufficient for validating file paths when user input can contain `..` or other traversal characters. The path must be canonicalized before validation.
**Prevention:** Always use `filepath.Clean()` (or `filepath.Abs()` if dealing with absolute paths) to resolve directory traversal sequences before performing any prefix checks or access control logic. Ensure the prefix check includes a trailing separator to prevent partial name matching (e.g., `/tmp/dir` matching `/tmp/directory`).

## 2026-01-20 - Stored XSS via File Upload
**Vulnerability:** The `handleUpload` function in `server/handlers.go` allowed uploading files with any extension. The `handleRead` function would then serve these files with a `Content-Type` header determined by the extension (or sniffing). This allowed attackers to upload `.html` files containing malicious scripts (Stored XSS) or other dangerous file types.
**Learning:** Never trust user input, especially file extensions. Relying on "security by obscurity" (random filenames) is insufficient if the extension is preserved and the file is served with an executable content type.
**Prevention:** Implement a strict allowlist of file extensions for uploads. Only allow safe types (like images) if that's the intended use case.
