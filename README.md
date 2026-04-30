# diff-coverage

A CLI tool that measures Jest/Vitest test coverage **only for files changed in a git diff**.

Instead of measuring whole-project coverage, `diff-coverage` focuses on the lines you actually changed — giving you actionable, targeted feedback.

## Features

- Measures coverage only for changed files (not the entire codebase)
- Supports both **Jest** and **Vitest** (auto-detected)
- Per-file coverage breakdown with uncovered line numbers
- Configurable pass/fail threshold (exits with code 1 on failure)
- JSON output for programmatic use
- GitHub PR review comments with coverage gaps (`review` command)

## Installation

```bash
npm install -g diff-coverage
```

Or run without installing via `npx`:

```bash
npx diff-coverage measure --cwd /path/to/your/project
```

## CLI Usage

### Basic — compare against `main`

```bash
diff-coverage measure --cwd /path/to/your/project
```

### All options

```bash
diff-coverage measure \
  --cwd /path/to/project \   # project root (required)
  --base main \               # base branch to diff against (default: main)
  --cmd "npx jest" \          # test runner command (default: auto-detected)
  --threshold 80 \            # fail if coverage is below this % (exit code 1)
  --json                      # output results as JSON
```

### List changed files without running tests

```bash
diff-coverage diff --cwd /path/to/project
```

### Example output

```text
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

## CI Usage

```yaml
# .github/workflows/coverage.yml
- name: Check diff coverage
  run: |
    npx diff-coverage measure \
      --cwd . \
      --base ${{ github.base_ref }} \
      --threshold 80
```

## Jest / Vitest Configuration

`diff-coverage` works with your existing config with no changes required. For Jest, make sure `coverageDirectory` points to `coverage/` (the default):

```js
// jest.config.js
module.exports = {
  coverageDirectory: "coverage", // default — usually no change needed
}
```

## Contributing

```bash
git clone https://github.com/ksugawara61/diff-coverage
cd diff-coverage
pnpm install
pnpm build
pnpm test
```

## License

MIT
