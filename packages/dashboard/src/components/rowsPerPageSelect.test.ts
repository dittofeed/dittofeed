import { parseRowsPerPage } from "./rowsPerPageSelect";

describe("parseRowsPerPage", () => {
  it("accepts the supported page sizes", () => {
    expect(parseRowsPerPage("10")).toBe(10);
    expect(parseRowsPerPage("25")).toBe(25);
    expect(parseRowsPerPage("50")).toBe(50);
    expect(parseRowsPerPage("100")).toBe(100);
  });

  it("ignores unsupported or malformed values", () => {
    expect(parseRowsPerPage("7")).toBeUndefined();
    expect(parseRowsPerPage("1000")).toBeUndefined();
    expect(parseRowsPerPage("abc")).toBeUndefined();
    expect(parseRowsPerPage("")).toBeUndefined();
    expect(parseRowsPerPage(undefined)).toBeUndefined();
    expect(parseRowsPerPage(["50", "100"])).toBeUndefined();
  });
});
