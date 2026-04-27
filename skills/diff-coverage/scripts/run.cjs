#!/usr/bin/env node
// Wrapper to locate the diff-coverage CLI and invoke it with node.
//
// Installed as a project-scope skill (.claude/skills/diff-coverage/scripts/):
//   __dirname resolves to <project>/.claude/skills/diff-coverage/scripts/
//   so ../../../../ reaches the project root where dist/cli.js lives.
//
// Installed as a user-scope skill (~/.claude/skills/diff-coverage/scripts/):
//   dist/cli.js won't be found, falls back to npx diff-coverage.

const { spawnSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

const args = process.argv.slice(2);

const projectRoot = path.resolve(__dirname, "../../../../");
const localCli = path.join(projectRoot, "dist", "cli.js");

if (existsSync(localCli)) {
  const result = spawnSync(process.execPath, [localCli, ...args], {
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
} else {
  const result = spawnSync("npx", ["--yes", "diff-coverage", ...args], {
    stdio: "inherit",
    shell: true,
  });
  process.exit(result.status ?? 1);
}
