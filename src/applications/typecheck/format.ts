import type { TypecheckFileResult, TypecheckResult } from "./index.js";

const formatTypecheckFileErrors = (f: TypecheckFileResult): string => {
  const plural = f.errors.length > 1 ? "s" : "";
  const lines = [
    `\n❌ ${f.path} (${f.errors.length} error${plural})`,
    ...f.errors.map(
      (err) => `   ${err.line}:${err.column}  ${err.code}  ${err.message}`,
    ),
  ];
  return lines.join("\n");
};

export const formatTypecheckResult = (result: TypecheckResult): string => {
  const { files, passed, totalErrors } = result;
  const out: string[] = ["=== TypeScript Type-Check Report ===\n"];

  if (files.length === 0) {
    out.push("No changed TypeScript files found.");
    return out.join("\n");
  }

  out.push(`Files checked: ${files.length}`);
  out.push(`Total errors: ${totalErrors}`);
  out.push(`Status: ${passed ? "✅ PASS" : "❌ FAIL"}`);

  if (totalErrors > 0) {
    out.push("\n--- Errors by File ---");
    for (const f of files) {
      if (f.errors.length > 0) out.push(formatTypecheckFileErrors(f));
    }
  }

  return out.join("\n");
};
