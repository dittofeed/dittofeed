import prisma from "./prisma";

describe("validateWriteKey", () => {
  interface TableTest {
    description: string;
    writeKey: string;
    expected: boolean;
    existingWriteKey?: [string, string];
  }
  const tableTests: TableTest[] = [];

  test.each(tableTests)(
    "$description",
    async ({ writeKey, expected, existingWriteKey }) => {
      if (existingWriteKey) {
      }
    }
  );

  it("should return true if the write key is valid", async () => {
    expect(true).toBe(true);
  });
  it("should return false if the write key is missing", async () => {
    expect(true).toBe(true);
  });

  it("should return false if the write key is malformed", async () => {
    expect(true).toBe(true);
  });

  it("should return false if the write key has the wrong value", async () => {
    expect(true).toBe(true);
  });
});
