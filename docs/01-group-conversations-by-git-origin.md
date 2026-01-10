# Group Conversations by Git Origin

## 目的

左サイドバーのConversationsリストを、gitリポジトリのorigin単位でグルーピングして表示する。

## 背景・課題

- 複数プロジェクトで作業していると、会話がフラットに混在して見づらい
- 特定プロジェクトの会話をまとめて確認したい

## 調査結果・前提

### 既存の仕組み
- 各会話には`cwd`（作業ディレクトリ）が保存されている
- `cwd`変更時は`OnWorkingDirChange`コールバックで追跡される
- worktree（shelley, shelley-2, shelley-3...）は同じgit originを持つ

### グルーピング方法の選択肢
1. **cwdパスからプロジェクト名抽出** - シンプルだがworktree対応不可
2. **git origin URLをDBに保存** ✅ 採用 - worktreeも同一グループに
3. **手動タグ付け** - ユーザー負担大

## 方針

- `git remote get-url origin`でorigin URLを取得してDBに保存
- 会話作成時とcwd変更時の両方で更新
- UIではorigin URLからリポジトリ名を抽出して表示
- グループはシンプルな中見出しで表示（折りたたみなし）

## 実現方法

### DB変更
- `conversations`テーブルに`git_origin`カラム追加（migration 013）
- `UpdateConversationCwdAndGitOrigin`クエリ追加

### バックエンド変更
- `gitstate.GetGitOrigin(dir)`: 指定ディレクトリのgit origin URL取得
- 会話作成時（`handlers.go`）: cwdからgit originを取得して保存
- cwd変更時（`convo.go` の `OnWorkingDirChange`）: 新しいcwdのgit originも同時に更新

### フロントエンド変更
- `extractRepoName()`: origin URLからリポジトリ名を抽出
  - SSH: `git@github.com:user/shelley.git` → `shelley`
  - HTTPS: `https://github.com/user/shelley.git` → `shelley`
- `groupedConversations`: 会話をリポジトリ名でグルーピング
- グループの並び順: 最新の会話があるグループが一番上
- git originがない会話は「other」グループに
- 一番上のグループが変わったらスクロールをトップに

### CSSスタイル
- `.conversation-group-header`: 太字、上下ボーダー、幅いっぱい
- 最初のグループは`border-top: none`、`margin-top: -0.5rem`

## 手順

1. DBスキーマ追加（013-add-git-origin.sql）
2. sqlc generate
3. go2ts で TypeScript型生成
4. `gitstate.GetGitOrigin()`関数追加
5. `db.CreateConversation()`にgitOrigin引数追加
6. `db.UpdateConversationCwdAndGitOrigin()`追加
7. `server/handlers.go`で会話作成時にgit origin取得
8. `server/convo.go`でcwd変更時にgit originも更新
9. `ConversationDrawer.tsx`でグルーピング表示実装
10. `styles.css`でヘッダースタイル追加
11. 既存データのgit_originを手動更新（sqlite3で一括UPDATE）

## 結果

- PR #28: https://github.com/anoworl/shelley/pull/28
- 会話がリポジトリ単位でグルーピング表示される
- worktree（shelley, shelley-2...）は同じ「shelley」グループに
- 最新の会話があるプロジェクトが一番上に表示

## 今後の課題・改善案

- **リポジトリ名衝突**: 異なるorigin（github.com/org/app vs gitlab.com/other/app）が同じリポジトリ名だと同一グループになる
  - 対応案: フルorigin URLでグルーピングし、表示だけ短いリポジトリ名に
  - 現状: 個人用途では問題なし、対応保留
- **グループの折りたたみ**: 会話数が多い場合に有用かも
