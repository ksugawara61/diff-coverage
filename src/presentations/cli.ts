#!/usr/bin/env node
import { Command } from "commander";
import { registerDetectCommand } from "./cli/commands/detect.js";
import { registerDiffCommand } from "./cli/commands/diff.js";
import { registerMeasureCommand } from "./cli/commands/measure.js";
import { registerReviewCommand } from "./cli/commands/review.js";
import { registerTypecheckCommand } from "./cli/commands/typecheck.js";

const name = "diff-coverage";
const version = "0.1.4";

const program = new Command();

program
  .name(name)
  .description("Measure test coverage for git diff files (Jest or Vitest)")
  .version(version);

registerMeasureCommand(program);
registerDiffCommand(program);
registerDetectCommand(program);
registerTypecheckCommand(program);
registerReviewCommand(program);

program.parse();
