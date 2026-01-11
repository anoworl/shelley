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
- Add Model/Dir display in header; ultra-compact mobile header with extended tap areas (files: `ui/src/components/ChatInterface.tsx`, `ui/src/styles.css`)
- Auto-resume interrupted conversations after server restart (files: `server/recovery.go`, `server/convo.go`, `server/server.go`, `loop/loop.go`, `db/query/conversations.sql`)
- Use conversation ID in URL instead of slug; allow Unicode characters in titles (files: `ui/src/App.tsx`, `ui/src/components/ConversationDrawer.tsx`, `ui/src/services/api.ts`, `slug/slug.go`, `server/handlers.go`, `server/server.go`, `db/db.go`, `db/query/conversations.sql`)
- Compact drawer header layout; move archived toggle to header; extend conversation list to safe-area on mobile (files: `ui/src/components/ConversationDrawer.tsx`, `ui/src/styles.css`)
- Group consecutive tool calls into collapsible accordion for cleaner timeline (files: `ui/src/components/ToolGroup.tsx`, `ui/src/components/ChatInterface.tsx`, `ui/src/styles.css`)

## Compatibility / behavior changes

- URL format changed from `/c/<slug>` to `/c/<conversation_id>` - old slug-based URLs will no longer work
- Conversation titles now accept any Unicode characters (previously only ASCII alphanumeric and hyphens)

## Known issues

- None
