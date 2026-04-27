---
name: diff-coverage
description: Measure test coverage only for files changed in a git diff using Jest or Vitest. Use when checking test coverage of code changes, reviewing uncovered lines in a PR, or enforcing coverage thresholds on changed files.
when_to_use: Triggered by requests like "check coverage for my changes", "what lines are uncovered in the diff", "measure diff coverage", "are my changes tested", or "coverage report for this PR".
allowed-tools: Bash(node *)
---

# diff-coverage

Measures test coverage scoped only to files changed in a git diff. Reports per-file coverage, uncovered lines, and optionally enforces a threshold (exit code 1 on failure).

## Installation

Install as a project-scope skill from the diff-coverage repository root (requires a prior `pnpm build`):

```bash
gh skill install ksugawara61/diff-coverage --scope project
```

Or as a user-scope skill (falls back to `npx diff-coverage` if local build is unavailable):

```bash
gh skill install ksugawara61/diff-coverage --scope user
```

## Commands

All commands are invoked via the bundled wrapper:

```
node "${CLAUDE_SKILL_DIR}/scripts/run.cjs" <command> [options]
```

### measure — run coverage for changed files

```bash
node "${CLAUDE_SKILL_DIR}/scripts/run.cjs" measure \
  --cwd <project-dir> \
  --base <git-ref>
```

| Flag | Default | Description |
|------|---------|-------------|
| `--cwd <path>` | `.` | Target project directory |
| `--base <ref>` | `main` | Base git ref to diff against |
| `--threshold <n>` | none | Fail (exit 1) if coverage < n% |
| `--runner <jest\|vitest>` | auto-detected | Force a specific test runner |

Example — measure coverage for changes vs `main` in the current project:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/run.cjs" measure --cwd . --base main
```

Example — enforce 80% threshold:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/run.cjs" measure --cwd . --base main --threshold 80
```

### diff — list changed files and added lines

```bash
node "${CLAUDE_SKILL_DIR}/scripts/run.cjs" diff --cwd . --base main
```

### detect — identify the test runner

```bash
node "${CLAUDE_SKILL_DIR}/scripts/run.cjs" detect --cwd .
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
