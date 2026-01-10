# Shelley Agent Git & Pull Request Guide

This document provides guidelines for commits, branches, and pull requests.

## Critical Rules

### ⚠️ NEVER Push to Upstream

**Absolutely DO NOT push or create pull requests to the upstream repository (`boldsoftware/shelley`).**

This fork (`anoworl/shelley`) is for personal battle-tested tweaks. All work stays in this fork.

### Ask Before Committing

**Always ask the user for permission before making any commit.** Do not commit automatically.

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/) with scope-based prefixes.

### Format

```
<scope>: <description>

[optional body]
```

### Common Scopes

| Scope | Description |
|-------|-------------|
| `ui` | UI/frontend changes |
| `server` | Backend server changes |
| `deploy` | Deployment-related changes |
| `docs` | Documentation |
| `ci` | CI/CD configuration |
| `all` | Changes spanning multiple areas |
| `loop` | Agent loop changes |
| `claudetool` | Tool implementations |

### Examples

```
ui: use instant scroll instead of smooth scroll for faster initial load

server: fix ETag caching for weak validators

docs: add Claude GitHub Actions to FORK_NOTES.md

ci: use claude-opus-4-5-20251101 for GitHub Actions
```

### The Seven Rules (from Chris Beams)

Based on [How to Write a Git Commit Message](https://cbea.ms/git-commit/):

1. **Separate subject from body with a blank line**
2. **Limit the subject line to 50 characters** (72 max)
3. **Capitalize the subject line** (after the scope prefix)
4. **Do not end the subject line with a period**
5. **Use the imperative mood** ("Add feature" not "Added feature")
6. **Wrap the body at 72 characters**
7. **Use the body to explain what and why vs. how**

### Imperative Mood Test

A properly formed subject should complete this sentence:

> If applied, this commit will _your subject line here_

Examples:
- ✅ If applied, this commit will **use instant scroll for faster load**
- ✅ If applied, this commit will **fix ETag caching for weak validators**
- ❌ If applied, this commit will ~~fixed the bug~~
- ❌ If applied, this commit will ~~adding new feature~~

## Branch Naming

Use descriptive, kebab-case names:

```
instant-scroll
fix-etag-caching
add-deploy-self-tool
```

## Pull Request Guidelines

### PR Title

Same format as commit messages:

```
<scope>: <description>
```

### PR Body: What-Why-How

Structure your PR description with these three sections:

```markdown
## What
Brief description of the change.

## Why
Explain the motivation. What problem does this solve?

## How
Explain the approach taken (if not obvious from the diff).
```

### Example PR

**Title:** `ui: use instant scroll instead of smooth scroll for faster initial load`

**Body:**
```markdown
## What
Changed scrollToBottom() to use `behavior: "instant"` instead of `behavior: "smooth"`.

## Why
When loading conversations with many messages, smooth scrolling takes too long
and makes the UI feel sluggish.

## How
Single-line change in ChatInterface.tsx.
```

## FORK_NOTES.md Updates

When making changes unique to this fork, update `FORK_NOTES.md` to track:

1. Add a line to "Summary of changes" describing the change
2. If the change affects behavior, add to "Compatibility / behavior changes"
3. If there are known issues, document them

## Workflow Summary

1. Make changes on a feature branch
2. **Ask user permission before committing**
3. Write commit message following the format above
4. Update `FORK_NOTES.md` if needed
5. Push to `origin` (this fork only!)
6. Create PR to `main` branch of this fork
7. **Never push to or create PR against upstream**

## Atomic Commits

Each commit should contain only one logical change.

### Good ✅
- `ui: add scroll-to-bottom button`
- `ui: style scroll-to-bottom button`
- `ui: add keyboard shortcut for scroll-to-bottom`

### Bad ❌
- `ui: add scroll button, fix header bug, update styles`

### Decision Criteria
- Can this commit be reverted as a meaningful unit?
- Can the commit message be explained in one line?

## Pre-Commit Checklist

Verify before committing:

- [ ] `pnpm run build` (UI) succeeds
- [ ] `go build ./...` succeeds
- [ ] Related tests pass
- [ ] No TypeScript type errors
- [ ] Removed unnecessary console.log/debug code
- [ ] Updated FORK_NOTES.md

## PR Self-Review

Review your diff before creating a PR:

```bash
git diff main...HEAD
```

Check for:
- Unintended changes
- Leftover debug code
- Sensitive information (API keys, etc.)

## Responding to PR Review Comments

When automated reviewers (e.g., Claude Code Review bot) leave comments:

1. **Investigate the issue** - Understand the actual impact
2. **Check for practical UX impact** - If there's no real user-facing problem, don't add complexity
3. **Reply in the thread** - Use `gh api` to reply directly to the comment thread:
   ```bash
   gh api repos/anoworl/shelley/pulls/{pr}/comments/{comment_id}/replies \
     -X POST -f body="Your response — by Shelley 🤖"
   ```
4. **Sign responses** - End with `— by Shelley 🤖` to indicate agent-generated reply

Refer to AGENT.md #17: Prioritize code cleanliness over theoretical fixes with no practical impact.

## Merge Strategy

**Use regular merge only. Do not use Squash or Rebase.**

- Preserve all commit history
- Select "Create a merge commit" in GitHub UI
- Do not rebase (avoid rewriting history)

## Quick Reference

```bash
# Create branch
git checkout -b feature-name

# Commit (after user permission)
git add <specific-files>
git commit -m "scope: description"

# Push to fork
git push -u origin feature-name

# Create PR with gh CLI
gh pr create --title "scope: description" --body "## What
...

## Why
...

## How
..." --base main
```
