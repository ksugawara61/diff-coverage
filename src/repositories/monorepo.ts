import { access } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { DiffFile } from "./git.js";

export const findNearestPackageDir = async (
  startDir: string,
  stopDir: string,
): Promise<string | null> => {
  let dir = startDir;
  while (dir === stopDir || dir.startsWith(`${stopDir}/`)) {
    try {
      await access(join(dir, "package.json"));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
};

export const groupDiffFilesByPackage = async (
  cwd: string,
  diffFiles: DiffFile[],
): Promise<Map<string, DiffFile[]>> => {
  const entries = await Promise.all(
    diffFiles.map(async (file) => {
      const absPath = resolve(cwd, file.path);
      const pkgDir = await findNearestPackageDir(dirname(absPath), cwd);
      return { file, pkgDir: pkgDir ?? cwd };
    }),
  );

  return entries.reduce<Map<string, DiffFile[]>>((acc, { file, pkgDir }) => {
    const existing = acc.get(pkgDir) ?? [];
    acc.set(pkgDir, [...existing, file]);
    return acc;
  }, new Map());
};

export const remapDiffFilePaths = (
  files: DiffFile[],
  originalCwd: string,
  newCwd: string,
): DiffFile[] =>
  files.map((file) => ({
    ...file,
    path: relative(newCwd, resolve(originalCwd, file.path)),
  }));
