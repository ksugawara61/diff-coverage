import { describe, expect, it } from "vitest";
import type { FileDetail } from "../../../repositories/coverage-files.js";
import {
  collectUncoveredBranches,
  collectUncoveredFunctions,
  collectUncoveredStatements,
} from "./uncovered.js";

const makeFileDetail = (overrides: Partial<FileDetail> = {}): FileDetail => ({
  b: {},
  branchMap: {},
  f: {},
  fnMap: {},
  s: {},
  statementMap: {},
  ...overrides,
});

describe("collectUncoveredStatements", () => {
  it("returns empty array when all statements are covered", () => {
    const fileData = makeFileDetail({
      s: { "0": 1, "1": 2 },
      statementMap: {
        "0": { end: { column: 10, line: 5 }, start: { column: 0, line: 5 } },
        "1": { end: { column: 10, line: 6 }, start: { column: 0, line: 6 } },
      },
    });
    expect(collectUncoveredStatements(fileData)).toEqual([]);
  });

  it("returns lines of uncovered statements", () => {
    const fileData = makeFileDetail({
      s: { "0": 0, "1": 1, "2": 0 },
      statementMap: {
        "0": { end: { column: 10, line: 3 }, start: { column: 0, line: 3 } },
        "1": { end: { column: 10, line: 5 }, start: { column: 0, line: 5 } },
        "2": { end: { column: 10, line: 8 }, start: { column: 0, line: 8 } },
      },
    });
    expect(collectUncoveredStatements(fileData)).toEqual([3, 8]);
  });

  it("deduplicates lines and sorts them", () => {
    const fileData = makeFileDetail({
      s: { "0": 0, "1": 0 },
      statementMap: {
        "0": { end: { column: 5, line: 10 }, start: { column: 0, line: 10 } },
        "1": { end: { column: 15, line: 10 }, start: { column: 6, line: 10 } },
      },
    });
    expect(collectUncoveredStatements(fileData)).toEqual([10]);
  });

  it("returns empty array when s is undefined", () => {
    const fileData = makeFileDetail({ s: undefined });
    expect(collectUncoveredStatements(fileData)).toEqual([]);
  });
});

describe("collectUncoveredFunctions", () => {
  it("returns empty array when all functions are covered", () => {
    const fileData = makeFileDetail({
      f: { "0": 1, "1": 3 },
      fnMap: {
        "0": { loc: { start: { column: 0, line: 1 } }, name: "foo" },
        "1": { loc: { start: { column: 0, line: 5 } }, name: "bar" },
      },
    });
    expect(collectUncoveredFunctions(fileData)).toEqual([]);
  });

  it("returns names and lines of uncovered functions", () => {
    const fileData = makeFileDetail({
      f: { "0": 0, "1": 2 },
      fnMap: {
        "0": { loc: { start: { column: 0, line: 3 } }, name: "foo" },
        "1": { loc: { start: { column: 0, line: 7 } }, name: "bar" },
      },
    });
    expect(collectUncoveredFunctions(fileData)).toEqual(["foo (line 3)"]);
  });

  it("returns empty array when f is undefined", () => {
    const fileData = makeFileDetail({ f: undefined });
    expect(collectUncoveredFunctions(fileData)).toEqual([]);
  });
});

describe("collectUncoveredBranches", () => {
  it("returns empty array when all branches are covered", () => {
    const fileData = makeFileDetail({
      b: { "0": [1, 1] },
      branchMap: {
        "0": {
          locations: [
            { start: { column: 0, line: 4 } },
            { start: { column: 10, line: 4 } },
          ],
        },
      },
    });
    expect(collectUncoveredBranches(fileData)).toEqual([]);
  });

  it("returns lines of uncovered branch locations", () => {
    const fileData = makeFileDetail({
      b: { "0": [0, 1], "1": [0, 0] },
      branchMap: {
        "0": {
          locations: [
            { start: { column: 0, line: 4 } },
            { start: { column: 10, line: 4 } },
          ],
        },
        "1": {
          locations: [
            { start: { column: 0, line: 9 } },
            { start: { column: 5, line: 9 } },
          ],
        },
      },
    });
    expect(collectUncoveredBranches(fileData)).toEqual([4, 9]);
  });

  it("deduplicates lines and sorts them", () => {
    const fileData = makeFileDetail({
      b: { "0": [0, 0] },
      branchMap: {
        "0": {
          locations: [
            { start: { column: 0, line: 7 } },
            { start: { column: 10, line: 7 } },
          ],
        },
      },
    });
    expect(collectUncoveredBranches(fileData)).toEqual([7]);
  });

  it("returns empty array when b is undefined", () => {
    const fileData = makeFileDetail({ b: undefined });
    expect(collectUncoveredBranches(fileData)).toEqual([]);
  });
});
