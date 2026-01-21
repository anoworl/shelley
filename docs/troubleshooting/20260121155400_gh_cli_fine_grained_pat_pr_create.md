# gh pr create fails with Fine-grained PAT

## Problem

`gh pr create` fails with error:

```
pull request create failed: GraphQL: Resource not accessible by personal access token (createPullRequest)
```

While `gh api repos/{owner}/{repo}/pulls` (REST API) works fine.

## Cause

1. `gh pr create` uses GraphQL API which queries `projectCards` field
2. Fine-grained PAT requires `repository-projects: read` permission for this
3. However, GitHub removed this permission from the Fine-grained PAT UI (due to Projects v1 API sunset)
4. Therefore, newly created Fine-grained PATs cannot have this permission

## Solution

**Update gh CLI to version 2.50.0 or later.**

PR [cli/cli#10942](https://github.com/cli/cli/pull/10942) (merged 2025-05-08) fixed this by not requesting `projectCards` when the permission is unavailable.

```bash
# Add GitHub's official apt repository
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null

# Install latest version
sudo apt update && sudo apt install gh
```

Note: Ubuntu's default repository may have an older version (e.g., 2.45.0) that doesn't include the fix.

## Workaround (if update is not possible)

Use REST API directly:

```bash
gh api repos/{owner}/{repo}/pulls -X POST \
  -f title="PR title" \
  -f body="PR body" \
  -f head="branch-name" \
  -f base="main"
```

## References

- [cli/cli#9166](https://github.com/cli/cli/issues/9166) - Cannot use fine-grained PATs to add labels to pull requests
- [cli/cli#10714](https://github.com/cli/cli/issues/10714) - Commands that interact with classic projects should continue to work
- [cli/cli#10942](https://github.com/cli/cli/pull/10942) - Fix for this issue
