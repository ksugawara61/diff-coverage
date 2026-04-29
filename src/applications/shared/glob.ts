export const globToRegex = (glob: string): string => {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\?/g, "[^/]")
    .split("**/")
    .map((seg) => seg.split("**").join(".*").split("*").join("[^/]*"))
    .join("(.*/)?");
  return glob.includes("/") ? `^${escaped}($|/)` : `(^|/)${escaped}$`;
};
