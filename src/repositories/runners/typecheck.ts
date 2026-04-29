import { execa } from "execa";

export const runTsc = async (cwd: string, cmd?: string): Promise<string> => {
  const fullCmd = cmd ?? "npx tsc --noEmit";
  const [bin, ...args] = fullCmd.split(" ");
  const result = await execa(bin, args, { cwd, reject: false });
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
};
