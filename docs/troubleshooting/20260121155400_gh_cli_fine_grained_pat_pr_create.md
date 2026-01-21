# gh pr create fails with Fine-grained PAT

## Problem

`gh pr create` fails with error:

```
pull request create failed: GraphQL: Resource not accessible by personal access token (createPullRequest)
```

While `gh api repos/{owner}/{repo}/pulls` (REST API) works fine.

## Cause

Fine-grained PAT does not fully support GraphQL API's `createPullRequest` mutation.

- `gh pr create` uses GraphQL API internally
- REST API works, but GraphQL mutation fails
- This is a GitHub API limitation, not a gh CLI bug
- gh CLI issue [#9403](https://github.com/cli/cli/issues/9403) is marked as "blocked" waiting for GitHub API improvements

## Solution

**Use REST API directly instead of `gh pr create`:**

```bash
gh api repos/{owner}/{repo}/pulls -X POST \
  -f title="PR title" \
  -f body="PR body" \
  -f head="branch-name" \
  -f base="main"
```

**Alternative: Use Classic PAT**

Classic PAT with `repo` scope works reliably with `gh pr create`.

## What doesn't work

- Updating gh CLI to latest version (tested with 2.85.0) does not fix this
- Adding `Contents: Read and write` permission does not fix this specific error
  - Note: [#9403](https://github.com/cli/cli/issues/9403) mentions this fixes `defaultBranchRef` error, but not `createPullRequest` error

## References

- [cli/cli#9403](https://github.com/cli/cli/issues/9403) - Detect missing fine-grained permission scopes (blocked)
- [cli/cli#9166](https://github.com/cli/cli/issues/9166) - Cannot use fine-grained PATs to add labels to pull requests
