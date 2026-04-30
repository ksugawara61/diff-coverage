import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvOption } from "./csv.js";

describe("parseCsv", () => {
  it("splits comma-separated values", () => {
    expect(parseCsv("ts,tsx,js")).toEqual(["ts", "tsx", "js"]);
  });

  it("trims whitespace around each entry", () => {
    expect(parseCsv("ts, tsx , js")).toEqual(["ts", "tsx", "js"]);
  });

  it("filters out empty entries", () => {
    expect(parseCsv("ts,,js")).toEqual(["ts", "js"]);
  });
});

describe("parseCsvOption", () => {
  it("returns empty array when value is undefined", () => {
    expect(parseCsvOption(undefined)).toEqual([]);
  });

  it("parses the value when defined", () => {
    expect(parseCsvOption("*.mocks.ts,src/fixtures/**")).toEqual([
      "*.mocks.ts",
      "src/fixtures/**",
    ]);
  });
});
