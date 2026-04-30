# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

`diff-coverage` is a CLI tool that measures test coverage **only for files changed in a git diff**. Rather than measuring whole-project coverage, it runs Jest or Vitest on the changed files and reports per-file coverage, uncovered lines, and optional threshold enforcement (exit code 1 on failure).

## Commands

```bash
pnpm install        # Install dependencies
pnpm build          # Compile TypeScript → dist/
pnpm dev            # Watch mode compilation
pnpm test           # Run all tests once
pnpm test:watch     # Run tests in watch mode
pnpm typecheck      # Type-check without emitting
pnpm check          # Biome lint + format check
pnpm lint           # Biome lint only
pnpm format         # Auto-format with Biome
```

Run a single test file:
```bash
pnpm vitest run src/diff.test.ts
```

Run the compiled CLI against an example project:
```bash
node dist/presentations/cli.js measure --cwd example/jest-project --base main
node dist/presentations/cli.js measure --cwd example/vitest-project --base main
```

## Git Hooks (lefthook)

- **pre-commit**: Biome formats staged files and auto-restages them
- **pre-push**: Runs `typecheck` and `test` — both must pass

## Architecture

The project uses a layered architecture with a single CLI entry point:

- **`src/presentations/cli.ts`** — Commander-based CLI (`measure`, `diff`, `detect`, `typecheck`, `review` subcommands)
- **`src/applications/`** — Business logic per command (measure, diff, review, typecheck, detect)
- **`src/repositories/`** — Data access layer (git, github, coverage files, runners)

### Data flow for `measure`

1. `getDiffFiles()` runs `git diff <base>...HEAD` and parses the unified diff to extract changed files and which specific line numbers were added
2. `resolveRunner()` auto-detects Jest vs Vitest (checks for `vitest.config.*`, `jest.config.*`, then package.json)
3. `runCoverage()` invokes the appropriate runner with coverage flags scoped to only the diff'd files
4. Parses `coverage/coverage-final.json` (per-statement/branch/function data) and `coverage/coverage-summary.json`
5. Correlates uncovered lines with the added-line list from step 1
6. `formatResult()` renders the human-readable report with ✅/⚠️/❌ icons

### Runner differences

- **Jest** (`src/repositories/runners/jest.ts`): uses `--collectCoverageFrom` per file with `--findRelatedTests`
- **Vitest** (`src/repositories/runners/vitest.ts`): uses `--coverage.include` patterns; post-processes `coverage-final.json` to normalize Vitest's relative paths back to absolute paths (a compatibility quirk)

## Code Conventions

**Linter/formatter:** Biome with strict settings — enforced via git hooks and CI.

Key rules to be aware of:
- No `any` types — use explicit types or generics
- `type` keyword for type aliases, not `interface`
- Arrow functions required (no `function` declarations where avoidable)
- No non-null assertions (`!`)
- Named exports only — no default exports
- Max cyclomatic complexity 10

**TypeScript:** Strict mode, ES2022 target, NodeNext module resolution. Source maps and `.d.ts` files are emitted to `dist/`.

**Process execution:** All external processes (git, jest, vitest, tsc) are run via `execa`. Tests mock `execa` to avoid real process spawning.

**Test files** are colocated with their source files in `src/`. Each test file sits next to the module it tests (e.g. `src/repositories/runners/jest.test.ts` tests `src/repositories/runners/jest.ts`).
