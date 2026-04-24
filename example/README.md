# example

diff-coverage の動作確認用サンプルプロジェクト集。

| ディレクトリ | テストランナー |
|---|---|
| `jest-project/` | Jest + ts-jest |
| `vitest-project/` | Vitest + @vitest/coverage-v8 |

## 共通の使い方

1. diff-coverage をビルド（リポジトリルートで）

   ```bash
   npm run build
   ```

2. サンプルプロジェクトの依存をインストール

   ```bash
   cd example/jest-project && npm install && cd ../..
   cd example/vitest-project && npm install && cd ../..
   ```

3. カバレッジ計測を実行

   ```bash
   # Jest
   node dist/cli.js measure --cwd example/jest-project --base main

   # Vitest
   node dist/cli.js measure --cwd example/vitest-project --base main
   ```

## サンプルコードについて

各プロジェクトには `calculator.ts` と `validator.ts` の 2 ファイルがあり、それぞれ意図的にテストが書かれていない関数を含んでいます。

- `calculator.ts`: `factorial`・`clamp` が未テスト
- `validator.ts`: `isUrl`・`isPositiveInteger`・`truncate` が未テスト

`diff-coverage measure` を実行すると、これらの未カバー行が出力されます。
