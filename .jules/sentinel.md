## 2025-05-27 - Path Traversal in File Serving Handler
**Vulnerability:** A path traversal vulnerability was found in `handleRead` in `server/handlers.go`. The handler accepted a `path` query parameter and checked if it started with a specific allowed directory prefix using `strings.HasPrefix`. However, it did not clean the path before this check, allowing attackers to use `../` sequences to traverse out of the allowed directory after the prefix match (e.g., `/allowed/../etc/passwd`).
**Learning:** `strings.HasPrefix` is insufficient for validating file paths when user input can contain `..` or other traversal characters. The path must be canonicalized before validation.
**Prevention:** Always use `filepath.Clean()` (or `filepath.Abs()` if dealing with absolute paths) to resolve directory traversal sequences before performing any prefix checks or access control logic. Ensure the prefix check includes a trailing separator to prevent partial name matching (e.g., `/tmp/dir` matching `/tmp/directory`).

## 2025-05-27 - Arbitrary File Write in `handleWriteFile`
**Vulnerability:** The `handleWriteFile` handler in `server/handlers.go` claimed to restrict writes to git repositories but only checked if the path was absolute. This allowed arbitrary file overwrite on the host system (e.g., `/etc/passwd`).
**Learning:** Comments are not code. Always verify that security constraints described in comments are actually implemented in the logic.
**Prevention:** Implemented strict checks using `gitstate` to verify the target directory is within a valid git repository and explicitly blocked writes to `.git` directories to prevent repository corruption or hook execution.
