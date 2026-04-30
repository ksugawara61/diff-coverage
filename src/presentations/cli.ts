#!/usr/bin/env node
import { Command } from "commander";
import { registerDiffCommand } from "./cli/commands/diff.js";
import { registerMeasureCommand } from "./cli/commands/measure.js";
import { registerReviewCommand } from "./cli/commands/review.js";

const name = "diff-coverage";
const version = "0.1.4";

const program = new Command();

program
  .name(name)
  .description("Measure test coverage for git diff files (Jest or Vitest)")
  .version(version);

registerMeasureCommand(program);
registerDiffCommand(program);
registerReviewCommand(program);

program.parse();
