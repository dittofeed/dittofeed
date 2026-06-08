import {
  CustomEmailHeaderSchema,
  CustomEmailHeadersSchema,
  headersArrayToRecord,
  headersRecordToArray,
  validateAndSanitizeHeaders,
} from "../emailHeaders";

describe("Email Headers Schema Validation", () => {
  describe("CustomEmailHeaderSchema", () => {
    it("accepts valid X- prefixed headers", () => {
      const valid = { name: "X-PM-Message-Stream", value: "broadcast" };
      expect(CustomEmailHeaderSchema.safeParse(valid).success).toBe(true);
    });

    it("accepts X- headers with numbers", () => {
      const valid = { name: "X-Custom-123", value: "test" };
      expect(CustomEmailHeaderSchema.safeParse(valid).success).toBe(true);
    });

    it("rejects headers without X- prefix", () => {
      const invalid = { name: "Content-Type", value: "text/html" };
      expect(CustomEmailHeaderSchema.safeParse(invalid).success).toBe(false);
    });

    it("rejects headers with special characters", () => {
      const invalid = { name: "X-Header With Spaces", value: "test" };
      expect(CustomEmailHeaderSchema.safeParse(invalid).success).toBe(false);
    });

    it("rejects empty header name", () => {
      const invalid = { name: "", value: "test" };
      expect(CustomEmailHeaderSchema.safeParse(invalid).success).toBe(false);
    });

    it("rejects empty header value", () => {
      const invalid = { name: "X-Test", value: "" };
      expect(CustomEmailHeaderSchema.safeParse(invalid).success).toBe(false);
    });

    it("rejects just 'X-' as header name", () => {
      const invalid = { name: "X-", value: "test" };
      // 'X-' alone should fail because it needs at least one char after X-
      expect(CustomEmailHeaderSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe("CustomEmailHeadersSchema", () => {
    it("accepts up to 20 headers", () => {
      const headers = Array.from({ length: 20 }, (_, i) => ({
        name: `X-Header-${i}`,
        value: `value-${i}`,
      }));
      expect(CustomEmailHeadersSchema.safeParse(headers).success).toBe(true);
    });

    it("rejects more than 20 headers", () => {
      const headers = Array.from({ length: 21 }, (_, i) => ({
        name: `X-Header-${i}`,
        value: `value-${i}`,
      }));
      expect(CustomEmailHeadersSchema.safeParse(headers).success).toBe(false);
    });

    it("accepts empty array", () => {
      expect(CustomEmailHeadersSchema.safeParse([]).success).toBe(true);
    });
  });

  describe("headersArrayToRecord", () => {
    it("converts array to record correctly", () => {
      const headers = [
        { name: "X-First", value: "one" },
        { name: "X-Second", value: "two" },
      ];
      expect(headersArrayToRecord(headers)).toEqual({
        "X-First": "one",
        "X-Second": "two",
      });
    });

    it("handles duplicate names (last wins)", () => {
      const headers = [
        { name: "X-Dup", value: "first" },
        { name: "X-Dup", value: "second" },
      ];
      expect(headersArrayToRecord(headers)).toEqual({
        "X-Dup": "second",
      });
    });
  });

  describe("headersRecordToArray", () => {
    it("converts record to array correctly", () => {
      const record = { "X-A": "1", "X-B": "2" };
      const result = headersRecordToArray(record);
      expect(result).toContainEqual({ name: "X-A", value: "1" });
      expect(result).toContainEqual({ name: "X-B", value: "2" });
    });
  });

  describe("validateAndSanitizeHeaders", () => {
    it("returns valid headers unchanged", () => {
      const headers = [{ name: "X-Valid", value: "test" }];
      expect(validateAndSanitizeHeaders(headers)).toEqual(headers);
    });

    it("returns empty array for invalid input", () => {
      expect(validateAndSanitizeHeaders(null)).toEqual([]);
      expect(validateAndSanitizeHeaders(undefined)).toEqual([]);
      expect(validateAndSanitizeHeaders("string")).toEqual([]);
      expect(validateAndSanitizeHeaders(123)).toEqual([]);
    });
  });
});
