import { execa } from "execa";

type JestRunInput = { cwd: string; testCommand?: string };

export const runJest = async (
  options: JestRunInput,
  diffFilePaths: string[],
): Promise<void> => {
  const { cwd, testCommand } = options;

  const jestArgs = [
    "--coverage",
    ...diffFilePaths.map((p) => `--collectCoverageFrom=${p}`),
    "--coverageReporters=json-summary",
    "--coverageReporters=json",
    "--passWithNoTests",
    "--findRelatedTests",
    ...diffFilePaths,
  ];

  const cmd = testCommand ?? "npx jest";
  const [bin, ...baseArgs] = cmd.split(" ");

  await execa(bin, [...baseArgs, ...jestArgs], {
    cwd,
    env: { ...process.env, CI: "true" },
    reject: false,
  });
};
