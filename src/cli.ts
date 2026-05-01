#!/usr/bin/env node
import { Command } from "commander";
import { registerMeasureCommand } from "./presentations/measure/index.js";
import { registerReviewCommand } from "./presentations/review/index.js";

const name = "diff-coverage";
const version = "0.1.5";

const program = new Command();

program
  .name(name)
  .description("Measure test coverage for git diff files (Jest or Vitest)")
  .version(version);

registerMeasureCommand(program);
registerReviewCommand(program);

program.parse();
