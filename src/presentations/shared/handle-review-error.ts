import { NoPullRequestError } from "../../applications/review/index.js";
import {
  GhNotAuthenticatedError,
  GhNotInstalledError,
} from "../../repositories/github.js";

export const handleReviewError = (err: unknown): never => {
  if (err instanceof GhNotInstalledError) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  if (err instanceof GhNotAuthenticatedError) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  if (err instanceof NoPullRequestError) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
};
