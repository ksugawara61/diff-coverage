# diff-coverage

Git差分に対するJestテストカバレッジを計測するCLI & MCPサーバー。

Claude Codeと連携して、実装したコードに対してどれくらいテストが書かれているかを自動チェックできます。

## インストール

```bash
git clone https://github.com/yourname/diff-coverage
cd diff-coverage
npm install
npm run build
```

グローバルインストール:

```bash
npm install -g .
```

## CLI 使い方

### 基本（mainブランチとの差分を計測）

```bash
diff-coverage measure --cwd /path/to/your/project
```

### オプション一覧

```bash
diff-coverage measure \
  --cwd /path/to/project \   # プロジェクトルート（必須）
  --base main \               # 比較ブランチ（default: main）
  --cmd "npx jest" \          # Jestコマンド（default: npx jest）
  --threshold 80 \            # カバレッジ閾値%（未満でexit code 1）
  --json                      # JSON出力
```

### 変更ファイルだけ確認（テスト実行なし）

```bash
diff-coverage diff --cwd /path/to/project
```

### 出力例

```
=== Diff Coverage Report ===

Files changed: 3
Lines:      72.5% (58/80)
Statements: 70.0% (56/80)
Functions:  66.7% (4/6)
Branches:   50.0% (6/12)

Threshold: 80% → ❌ FAIL

--- Per File ---
✅ src/services/bookService.ts
   Lines: 90%  Stmts: 88%  Fns: 100%  Branches: 75%
⚠️ src/resolvers/bookResolver.ts
   Lines: 60%  Stmts: 58%  Fns: 50%  Branches: 40%
   Uncovered lines: 45, 67, 89, 102
❌ src/utils/parser.ts
   Lines: 30%  Stmts: 28%  Fns: 0%  Branches: 0%
   Uncovered lines: 12, 15, 18, 23, 34 ... (+8)
```

## MCP サーバーとして使う（Claude Code連携）

### 1. MCPサーバーを登録

```bash
# プロジェクトローカルに登録（.mcp.jsonに書き込まれる）
claude mcp add diff-coverage --scope project -- node /path/to/diff-coverage/dist/mcp.js

# またはユーザー全体に登録
claude mcp add diff-coverage --scope user -- node /path/to/diff-coverage/dist/mcp.js
```

### 2. または `.mcp.json` に直接記述

```json
{
  "mcpServers": {
    "diff-coverage": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/diff-coverage/dist/mcp.js"]
    }
  }
}
```

### 3. 利用可能なMCPツール

| ツール名 | 説明 |
|---|---|
| `measure_diff_coverage` | 差分ファイルのカバレッジ計測（Jestを実行） |
| `get_diff_files` | テスト実行なしで変更ファイルだけ確認 |
| `get_uncovered_lines` | 特定ファイルの未カバー行を詳細表示 |

### 4. CLAUDE.md に指示を追加（推奨）

```markdown
## テストカバレッジ

実装を完了したら必ず以下を実行してください：

1. `measure_diff_coverage` ツールでカバレッジを計測（cwd: /path/to/project）
2. カバレッジが80%未満のファイルは `get_uncovered_lines` で未カバー行を確認
3. 未カバー行に対してテストを追加してから実装完了とすること
```

## CI での使い方

```yaml
# .github/workflows/coverage.yml
- name: Check diff coverage
  run: |
    npx diff-coverage measure \
      --cwd . \
      --base ${{ github.base_ref }} \
      --threshold 80
```

## Jestの設定について

既存の `jest.config` をほぼ変更せず使えます。ただし `coverageDirectory` が `coverage/` を指していることを確認してください（Jestのデフォルト）。

```js
// jest.config.js
module.exports = {
  // coverageDirectory のデフォルトは "coverage" なので通常設定不要
  coverageDirectory: "coverage",
}
```
