import { valueMatchesContains } from "./valueMatchesContains";

describe("valueMatchesContains", () => {
  it("matches substrings in strings", () => {
    expect(valueMatchesContains("a", "abc")).toBe(true);
    expect(valueMatchesContains("x", "abc")).toBe(false);
  });

  it("matches array elements", () => {
    expect(valueMatchesContains("a", ["a", "b"])).toBe(true);
    expect(valueMatchesContains("x", ["a", "b"])).toBe(false);
  });

  it("coerces scalars to string", () => {
    expect(valueMatchesContains("2", 123)).toBe(true);
  });
});
