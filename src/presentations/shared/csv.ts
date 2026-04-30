export const parseCsv = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const parseCsvOption = (value: string | undefined): string[] =>
  value ? parseCsv(value) : [];
