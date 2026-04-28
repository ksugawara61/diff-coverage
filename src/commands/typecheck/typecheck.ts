import { relative, resolve } from "node:path";
import { execa } from "execa";
import type { DiffFile } from "../../shared/diff.js";

type TypecheckError = {
  code: string;
  column: number;
  file: string;
  line: number;
  message: string;
};

export type TypecheckFileResult = {
  errors: TypecheckError[];
  path: string;
};

export type TypecheckResult = {
  diffFiles: string[];
  files: TypecheckFileResult[];
  passed: boolean;
  timestamp: string;
  totalErrors: number;
};

export const runTypecheck = async (
  cwd: string,
  diffFiles: DiffFile[],
  cmd?: string,
): Promise<TypecheckResult> => {
  const fullCmd = cmd ?? "npx tsc --noEmit";
  const [bin, ...args] = fullCmd.split(" ");

  const result = await execa(bin, args, { cwd, reject: false });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

  const errorRegex = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;
  const allErrors: TypecheckError[] = [...output.matchAll(errorRegex)].map(
    ([, rawFile, line, column, code, message]) => ({
      code,
      column: Number.parseInt(column, 10),
      file: relative(cwd, resolve(cwd, rawFile)),
      line: Number.parseInt(line, 10),
      message,
    }),
  );

  const diffPathSet = new Set(diffFiles.map((f) => f.path));
  const diffErrors = allErrors.filter((e) => diffPathSet.has(e.file));

  const errorsByFile = diffErrors.reduce<Map<string, TypecheckError[]>>(
    (acc, err) => {
      const existing = acc.get(err.file) ?? [];
      existing.push(err);
      acc.set(err.file, existing);
      return acc;
    },
    new Map(),
  );

  const files: TypecheckFileResult[] = diffFiles.map((df) => ({
    errors: errorsByFile.get(df.path) ?? [],
    path: df.path,
  }));

  return {
    diffFiles: diffFiles.map((f) => f.path),
    files,
    passed: diffErrors.length === 0,
    timestamp: new Date().toISOString(),
    totalErrors: diffErrors.length,
  };
};
