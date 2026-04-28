import { join, relative } from "node:path";
import { execa } from "execa";
import { globToRegex } from "./config.js";

export type DiffFile = {
  addedLines: number[];
  additions: number;
  deletions: number;
  path: string;
};

export const DEFAULT_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mts", "cts"];
export const DEFAULT_EXCLUDE = [
  "\\.test\\.",
  "\\.spec\\.",
  "__tests__",
  "\\.d\\.ts$",
  "/node_modules/",
  "/dist/",
  "/coverage/",
];

const resolveBaseRef = async (cwd: string, base: string): Promise<string> => {
  try {
    await execa("git", ["rev-parse", "--verify", `origin/${base}`], { cwd });
    return `origin/${base}`;
  } catch {
    return base;
  }
};

const getAddedLines = async (
  cwd: string,
  base: string,
  filePath: string,
): Promise<number[]> => {
  try {
    const { stdout } = await execa(
      "git",
      ["diff", base, "--unified=0", "--", filePath],
      { cwd },
    );

    const lines: number[] = [];
    let currentLine = 0;

    for (const line of stdout.split("\n")) {
      const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (hunkHeader) {
        currentLine = Number.parseInt(hunkHeader[1], 10);
        continue;
      }
      if (line.startsWith("+") && !line.startsWith("+++")) {
        lines.push(currentLine++);
      } else if (!line.startsWith("-")) {
        currentLine++;
      }
    }

    return lines;
  } catch {
    return [];
  }
};

export const getDiffFiles = async (
  cwd: string,
  base = "main",
  extensions = DEFAULT_EXTENSIONS,
  excludePatterns = DEFAULT_EXCLUDE,
  exclude: string[] = [],
): Promise<DiffFile[]> => {
  const extPattern = extensions.join("|");
  const allExcludePatterns = [...excludePatterns, ...exclude.map(globToRegex)];

  const baseRef = await resolveBaseRef(cwd, base);

  const { stdout: gitRoot } = await execa(
    "git",
    ["rev-parse", "--show-toplevel"],
    { cwd },
  );

  const { stdout: nameOnly } = await execa(
    "git",
    ["diff", baseRef, "--name-only", "--diff-filter=ACM"],
    { cwd },
  );

  const toRelCwd = (p: string) => relative(cwd, join(gitRoot, p));

  const allFiles = nameOnly
    .split("\n")
    .filter(Boolean)
    .filter((f) => new RegExp(`\\.(${extPattern})$`).test(f))
    .filter((f) => !allExcludePatterns.some((p) => new RegExp(p).test(f)));

  if (allFiles.length === 0) return [];

  const { stdout: diffStat } = await execa(
    "git",
    ["diff", baseRef, "--numstat", "--diff-filter=ACM"],
    { cwd },
  );

  const statMap = diffStat
    .split("\n")
    .filter(Boolean)
    .reduce<Map<string, { additions: number; deletions: number }>>(
      (acc, line) => {
        const [add, del, file] = line.split("\t");
        acc.set(file, {
          additions: Number.parseInt(add, 10) || 0,
          deletions: Number.parseInt(del, 10) || 0,
        });
        return acc;
      },
      new Map(),
    );

  const files: DiffFile[] = [];
  for (const filePath of allFiles) {
    const stat = statMap.get(filePath) ?? { additions: 0, deletions: 0 };
    const relPath = toRelCwd(filePath);
    const addedLines = await getAddedLines(cwd, baseRef, filePath);
    files.push({ addedLines, path: relPath, ...stat });
  }

  return files;
};
