---
name: diff-coverage
description: Measure test coverage only for files changed in a git diff using Jest or Vitest. Use when checking test coverage of code changes, reviewing uncovered lines in a PR, or enforcing coverage thresholds on changed files.
when_to_use: Triggered by requests like "check coverage for my changes", "what lines are uncovered in the diff", "measure diff coverage", "are my changes tested", or "coverage report for this PR".
allowed-tools: Bash(node *)
disable-model-invocation: false
---

# diff-coverage

Measures test coverage scoped only to files changed in a git diff. Reports per-file coverage, uncovered lines, and optionally enforces a threshold (exit code 1 on failure).

## Prerequisites

The CLI must be compiled before first use. Run once from the project root:

```bash
node "${CLAUDE_SKILL_DIR}/../../../node_modules/.bin/tsc" --project "${CLAUDE_SKILL_DIR}/../../../tsconfig.json"
```

Or equivalently: `pnpm build` inside the project root.

## Commands

All commands use `node "${CLAUDE_SKILL_DIR}/../../../dist/cli.js"` as the base.

### measure — run coverage for changed files

```bash
node "${CLAUDE_SKILL_DIR}/../../../dist/cli.js" measure \
  --cwd <project-dir> \
  --base <git-ref>
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--cwd <path>` | `.` | Target project directory |
| `--base <ref>` | `main` | Base git ref to diff against |
| `--threshold <n>` | none | Fail (exit 1) if coverage < n% |
| `--runner <jest\|vitest>` | auto-detected | Force a specific test runner |

Example — measure coverage for changes vs `main` in the current project:

```bash
node "${CLAUDE_SKILL_DIR}/../../../dist/cli.js" measure --cwd . --base main
```

Example — enforce 80% threshold:

```bash
node "${CLAUDE_SKILL_DIR}/../../../dist/cli.js" measure --cwd . --base main --threshold 80
```

### diff — list changed files and added lines

```bash
node "${CLAUDE_SKILL_DIR}/../../../dist/cli.js" diff --cwd . --base main
```

### detect — identify the test runner

```bash
node "${CLAUDE_SKILL_DIR}/../../../dist/cli.js" detect --cwd .
```

## Workflow

1. Run `measure` against the target project's working directory
2. Review per-file coverage percentages and uncovered line numbers
3. Focus attention on uncovered lines that correspond to added code
4. If `--threshold` is set and fails, report exit code 1 to the user

## Output interpretation

- ✅ File meets the threshold (or no threshold set)
- ⚠️ File is below the threshold
- ❌ File has no coverage data

Uncovered lines listed under each file are the **added** lines (from the diff) that have no test coverage.
