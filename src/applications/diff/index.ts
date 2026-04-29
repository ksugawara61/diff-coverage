import type { DiffFile } from "../../repositories/git.js";
import { getDiffFiles } from "../../repositories/git.js";
import { mergeExcludePatterns } from "../shared/exclude-patterns.js";

type DiffFilesOptions = {
  base?: string;
  cwd: string;
  exclude?: string[];
  extensions?: string[];
};

type DiffFilesOutcome = {
  files: DiffFile[];
};

export const runDiffFiles = async (
  opts: DiffFilesOptions,
): Promise<DiffFilesOutcome> => {
  const excludePatterns = await mergeExcludePatterns(opts.cwd, opts.exclude);
  const files = await getDiffFiles(
    opts.cwd,
    opts.base,
    opts.extensions,
    undefined,
    excludePatterns,
  );
  return { files };
};

const ADDED_LINES_PREVIEW_LIMIT = 10;

const renderAddedLinesPreview = (addedLines: number[]): string => {
  if (addedLines.length === 0) return "";
  const preview = addedLines.slice(0, ADDED_LINES_PREVIEW_LIMIT).join(", ");
  const more = addedLines.length > ADDED_LINES_PREVIEW_LIMIT ? " ..." : "";
  return `\n  Added lines: ${preview}${more}`;
};

export const formatDiffFiles = (
  files: DiffFile[],
  opts?: { showAddedLines?: boolean },
): string => {
  if (files.length === 0) return "No changed source files.";

  if (opts?.showAddedLines) {
    const lines = files.map(
      (f) =>
        `${f.path}  (+${f.additions} additions, -${f.deletions} deletions)${renderAddedLinesPreview(f.addedLines)}`,
    );
    return `Changed files (${files.length}):\n\n${lines.join("\n\n")}`;
  }

  return files
    .map((f) => `${f.path}  (+${f.additions}/-${f.deletions})`)
    .join("\n");
};
