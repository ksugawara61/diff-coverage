import { describe, expect, it } from "vitest";
import { add, divide, isEven, multiply, subtract } from "./calculator.js";

describe("calculator", () => {
  describe("add", () => {
    it("adds two positive numbers", () => {
      expect(add(1, 2)).toBe(3);
    });
    it("adds negative numbers", () => {
      expect(add(-1, 1)).toBe(0);
    });
  });

  describe("subtract", () => {
    it("subtracts two numbers", () => {
      expect(subtract(5, 3)).toBe(2);
    });
  });

  describe("multiply", () => {
    it("multiplies two numbers", () => {
      expect(multiply(2, 3)).toBe(6);
    });
    it("returns 0 when multiplied by 0", () => {
      expect(multiply(5, 0)).toBe(0);
    });
  });

  describe("divide", () => {
    it("divides two numbers", () => {
      expect(divide(10, 2)).toBe(5);
    });
    it("throws on division by zero", () => {
      expect(() => divide(1, 0)).toThrow("Division by zero");
    });
  });

  describe("isEven", () => {
    it.each([
      [2, true],
      [4, true],
      [0, true],
      [1, false],
      [3, false],
    ])("isEven(%s) returns %s", (n, expected) => {
      expect(isEven(n)).toBe(expected);
    });
  });

  // factorial and clamp are not tested — coverage gaps for demonstration
});
