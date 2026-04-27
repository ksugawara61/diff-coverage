# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

`diff-coverage` is a CLI tool and MCP server that measures test coverage **only for files changed in a git diff**. Rather than measuring whole-project coverage, it runs Jest or Vitest on the changed files and reports per-file coverage, uncovered lines, and optional threshold enforcement (exit code 1 on failure).

It also exposes this functionality as an MCP server so Claude Code can call it directly as tools during code review.

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
node dist/cli.js measure --cwd example/jest-project --base main
node dist/cli.js measure --cwd example/vitest-project --base main
```

Run the MCP server:
```bash
node dist/mcp.js
```

## Git Hooks (lefthook)

- **pre-commit**: Biome formats staged files and auto-restages them
- **pre-push**: Runs `typecheck` and `test` — both must pass

## Architecture

The project has three entry points that all consume the same core module:

- **`src/cli.ts`** — Commander-based CLI (`measure`, `diff`, `detect`, `typecheck` subcommands)
- **`src/mcp.ts`** — MCP server wrapping core functions as tools for Claude Code
- **`src/core.ts`** — All business logic; the other two files are thin wrappers

### Data flow for `measure`

1. `getDiffFiles()` runs `git diff <base>...HEAD` and parses the unified diff to extract changed files and which specific line numbers were added
2. `resolveRunner()` auto-detects Jest vs Vitest (checks for `vitest.config.*`, `jest.config.*`, then package.json)
3. `runCoverage()` invokes the appropriate runner with coverage flags scoped to only the diff'd files
4. Parses `coverage/coverage-final.json` (per-statement/branch/function data) and `coverage/coverage-summary.json`
5. Correlates uncovered lines with the added-line list from step 1
6. `formatResult()` renders the human-readable report with ✅/⚠️/❌ icons

### Runner differences

- **Jest** (`src/runner/jest.ts`): uses `--collectCoverageFrom` per file with `--findRelatedTests`
- **Vitest** (`src/runner/vitest.ts`): uses `--coverage.include` patterns; post-processes `coverage-final.json` to normalize Vitest's relative paths back to absolute paths (a compatibility quirk)

### MCP tools

`src/mcp.ts` exposes four tools: `measure_diff_coverage`, `get_diff_files`, `get_uncovered_lines`, `detect_runner`. All use Zod for parameter validation and return both a formatted text string and structured JSON in the content array.

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

**Test files** are colocated with their source files in `src/`. Each test file sits next to the module it tests (e.g. `src/runner/jest.test.ts` tests `src/runner/jest.ts`).
