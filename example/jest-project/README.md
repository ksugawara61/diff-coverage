# example-jest

diff-coverage の動作確認用 Jest サンプルプロジェクト。

## セットアップ

```bash
cd example/jest-project
npm install
```

## テスト実行

```bash
npm test
npm run test:coverage
```

## diff-coverage で計測する

diff-coverage ルートで `npm run build` を済ませてから、このプロジェクトを対象に計測を実行します。

```bash
# リポジトリルートから
node dist/cli.js measure --cwd example/jest-project --base main
```

### 期待される出力

`src/calculator.ts` では `factorial` と `clamp`、`src/validator.ts` では `isUrl` / `isPositiveInteger` / `truncate` がテストされていないため、これらのファイルでカバレッジギャップが報告されます。

```
=== Diff Coverage Report ===

Files changed: 4
Lines:      XX% ...

--- Per File ---
⚠️ src/calculator.ts
   Uncovered lines: ... (factorial, clamp)
⚠️ src/validator.ts
   Uncovered lines: ... (isUrl, isPositiveInteger, truncate)
```
