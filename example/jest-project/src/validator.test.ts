import { isEmpty, isEmail } from "./validator";

describe("validator", () => {
  describe("isEmpty", () => {
    it("returns true for empty string", () => {
      expect(isEmpty("")).toBe(true);
    });
    it("returns true for whitespace-only string", () => {
      expect(isEmpty("   ")).toBe(true);
    });
    it("returns false for non-empty string", () => {
      expect(isEmpty("hello")).toBe(false);
    });
  });

  describe("isEmail", () => {
    it("validates a correct email", () => {
      expect(isEmail("user@example.com")).toBe(true);
    });
    it("rejects a string without @", () => {
      expect(isEmail("notanemail")).toBe(false);
    });
    it("rejects a string without domain", () => {
      expect(isEmail("user@")).toBe(false);
    });
  });

  // isUrl, isPositiveInteger, truncate are not tested — coverage gaps for demonstration
});
