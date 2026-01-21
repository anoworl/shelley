## 2025-05-27 - Path Traversal in File Serving Handler
**Vulnerability:** A path traversal vulnerability was found in `handleRead` in `server/handlers.go`. The handler accepted a `path` query parameter and checked if it started with a specific allowed directory prefix using `strings.HasPrefix`. However, it did not clean the path before this check, allowing attackers to use `../` sequences to traverse out of the allowed directory after the prefix match (e.g., `/allowed/../etc/passwd`).
**Learning:** `strings.HasPrefix` is insufficient for validating file paths when user input can contain `..` or other traversal characters. The path must be canonicalized before validation.
**Prevention:** Always use `filepath.Clean()` (or `filepath.Abs()` if dealing with absolute paths) to resolve directory traversal sequences before performing any prefix checks or access control logic. Ensure the prefix check includes a trailing separator to prevent partial name matching (e.g., `/tmp/dir` matching `/tmp/directory`).

## 2026-01-18 - Argument Injection in Git Handlers (Rejected)
**Vulnerability:** Argument injection vulnerabilities were found in `handleGitDiffFiles` and `handleGitFileDiff` in `server/git_handlers.go`. The handlers accepted a `diffID` from the URL and passed it directly to `exec.Command` as part of a git command argument.
**Rejection:** The fix was rejected because the application is single-user with no external input. The threat model assumes the user is trusted, and malicious input would require the user to attack themselves.
**Learning:** Security controls should align with the application's threat model. In single-user local applications, protecting against "malicious" user input may be considered unnecessary if the user is the only actor.
