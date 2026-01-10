# Fork Notes

- Upstream: [boldsoftware/shelley](https://github.com/boldsoftware/shelley)
- Base ref: `6bfc75b`
- Fork: [anoworl/shelley](https://github.com/anoworl/shelley)
- Purpose: Battle-tested tweaks from heavy daily use

## Summary of changes

- Add fork documentation (files: `README.md`, `FORK_NOTES.md`)
- Add Claude GitHub Actions for PR assistant and code review (files: `.github/workflows/claude.yml`, `.github/workflows/claude-code-review.yml`)
- Use instant scroll instead of smooth scroll for faster initial load (files: `ui/src/components/ChatInterface.tsx`)
- Add VSCode open button in header and clickable line numbers in PatchTool (files: `ui/src/components/ChatInterface.tsx`, `ui/src/components/PatchTool.tsx`, `ui/src/components/icons/VSCodeIcon.tsx`, `ui/src/services/vscode.ts`, `ui/src/styles.css`, `NOTICES`)
- Add virtual scrolling with virtua for better performance on long conversations; portal ContextMenu and UsageDetailModal to fix z-index issues (files: `ui/package.json`, `ui/src/components/ChatInterface.tsx`, `ui/src/components/ContextMenu.tsx`, `ui/src/components/UsageDetailModal.tsx`)
- Add hostname link in drawer header for quick proxy URL access (files: `ui/src/components/ConversationDrawer.tsx`, `ui/src/styles.css`)
- Add agent status indicator and context bar to conversation list with real-time updates via SSE (files: `db/schema/009-add-agent-working.sql`, `db/schema/010-add-context-window-size.sql`, `db/query/conversations.sql`, `server/server.go`, `server/handlers.go`, `ui/src/App.tsx`, `ui/src/components/ConversationDrawer.tsx`, `ui/src/services/api.ts`, `ui/src/styles.css`)
- Add swipe gesture to open/close conversation drawer on mobile (files: `ui/src/hooks/useSwipeDrawer.ts`, `ui/src/App.tsx`)
- Auto-detect and display GitHub PR/issue links in conversation list (files: `db/schema/012-add-github-urls.sql`, `server/github_urls.go`, `server/server.go`, `ui/src/components/ConversationDrawer.tsx`, `ui/src/styles.css`)
- Group conversations by git origin in sidebar drawer (files: `db/schema/013-add-git-origin.sql`, `db/query/conversations.sql`, `db/db.go`, `gitstate/gitstate.go`, `server/convo.go`, `server/handlers.go`, `ui/src/components/ConversationDrawer.tsx`, `ui/src/styles.css`)

## Compatibility / behavior changes

- None

## Known issues

- None
