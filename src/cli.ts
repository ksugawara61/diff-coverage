#!/usr/bin/env node
import { Command } from "commander";
import { registerDetectCommand } from "./commands/detect/index.js";
import { registerDiffCommand } from "./commands/diff/index.js";
import { registerMeasureCommand } from "./commands/measure/index.js";
import { registerReviewCommand } from "./commands/review/index.js";
import { registerTypecheckCommand } from "./commands/typecheck/index.js";

const program = new Command();

program
  .name("diff-coverage")
  .description("Measure test coverage for git diff files (Jest or Vitest)")
  .version("0.1.0");

registerMeasureCommand(program);
registerDiffCommand(program);
registerDetectCommand(program);
registerTypecheckCommand(program);
registerReviewCommand(program);

program.parse();
