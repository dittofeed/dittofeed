import {
  isValidHeaderName,
  isValidHeaderValue,
  parseCustomHeaders,
  toNodemailerHeaders,
  toSendGridHeaders,
  toPostmarkHeaders,
  toSESHeaders,
  toResendHeaders,
  resolveHeaderTemplates,
  CustomEmailHeader,
} from "./customHeaders";

describe("customHeaders", () => {
  describe("isValidHeaderName", () => {
    it("should accept valid header names", () => {
      expect(isValidHeaderName("X-PM-Message-Stream")).toBe(true);
      expect(isValidHeaderName("X-Custom-Header")).toBe(true);
      expect(isValidHeaderName("Reply-To")).toBe(true);
      expect(isValidHeaderName("X-Mailer")).toBe(true);
    });

    it("should reject empty header names", () => {
      expect(isValidHeaderName("")).toBe(false);
    });

    it("should reject header names with colons", () => {
      expect(isValidHeaderName("X-Header:Invalid")).toBe(false);
    });

    it("should reject header names with spaces", () => {
      expect(isValidHeaderName("X Header")).toBe(false);
    });

    it("should reject very long header names", () => {
      expect(isValidHeaderName("X-" + "a".repeat(255))).toBe(false);
    });
  });

  describe("isValidHeaderValue", () => {
    it("should accept valid header values", () => {
      expect(isValidHeaderValue("broadcast")).toBe(true);
      expect(isValidHeaderValue("some-value-123")).toBe(true);
      expect(isValidHeaderValue("")).toBe(true);
    });

    it("should reject null/undefined values", () => {
      expect(isValidHeaderValue(null as any)).toBe(false);
      expect(isValidHeaderValue(undefined as any)).toBe(false);
    });

    it("should reject very long values", () => {
      expect(isValidHeaderValue("a".repeat(2049))).toBe(false);
    });

    it("should reject bare CR or LF", () => {
      expect(isValidHeaderValue("hello\nworld")).toBe(false);
      expect(isValidHeaderValue("hello\rworld")).toBe(false);
    });

    it("should accept CRLF", () => {
      expect(isValidHeaderValue("hello\r\nworld")).toBe(true);
    });
  });

  describe("parseCustomHeaders", () => {
    it("should parse valid headers array", () => {
      const input = [
        { name: "X-PM-Message-Stream", value: "broadcast" },
        { name: "X-Custom", value: "test" },
      ];
      const result = parseCustomHeaders(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: "X-PM-Message-Stream", value: "broadcast" });
      expect(result[1]).toEqual({ name: "X-Custom", value: "test" });
    });

    it("should filter out invalid headers", () => {
      const input = [
        { name: "X-Valid", value: "ok" },
        { name: "", value: "invalid-name" },
        { name: "X-Also-Valid", value: "ok" },
        { invalid: true },
        null,
      ];
      const result = parseCustomHeaders(input);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("X-Valid");
      expect(result[1].name).toBe("X-Also-Valid");
    });

    it("should return empty array for null/undefined input", () => {
      expect(parseCustomHeaders(null)).toEqual([]);
      expect(parseCustomHeaders(undefined)).toEqual([]);
    });

    it("should return empty array for non-array input", () => {
      expect(parseCustomHeaders("string")).toEqual([]);
      expect(parseCustomHeaders(42)).toEqual([]);
      expect(parseCustomHeaders({})).toEqual([]);
    });

    it("should trim header names", () => {
      const input = [{ name: "  X-Trimmed  ", value: "value" }];
      const result = parseCustomHeaders(input);
      expect(result[0].name).toBe("X-Trimmed");
    });
  });

  describe("toNodemailerHeaders", () => {
    it("should convert to Record format", () => {
      const headers: CustomEmailHeader[] = [
        { name: "X-PM-Message-Stream", value: "broadcast" },
        { name: "X-Priority", value: "1" },
      ];
      const result = toNodemailerHeaders(headers);
      expect(result).toEqual({
        "X-PM-Message-Stream": "broadcast",
        "X-Priority": "1",
      });
    });

    it("should return empty object for empty array", () => {
      expect(toNodemailerHeaders([])).toEqual({});
    });
  });

  describe("toSendGridHeaders", () => {
    it("should convert to Record format", () => {
      const headers: CustomEmailHeader[] = [
        { name: "X-Custom-ID", value: "12345" },
      ];
      const result = toSendGridHeaders(headers);
      expect(result).toEqual({ "X-Custom-ID": "12345" });
    });
  });

  describe("toPostmarkHeaders", () => {
    it("should convert to Postmark Name/Value format", () => {
      const headers: CustomEmailHeader[] = [
        { name: "X-PM-Message-Stream", value: "broadcast" },
      ];
      const result = toPostmarkHeaders(headers);
      expect(result).toEqual([
        { Name: "X-PM-Message-Stream", Value: "broadcast" },
      ]);
    });
  });

  describe("toSESHeaders", () => {
    it("should convert to SES Name/Value format", () => {
      const headers: CustomEmailHeader[] = [
        { name: "X-SES-CONFIGURATION-SET", value: "my-set" },
      ];
      const result = toSESHeaders(headers);
      expect(result).toEqual([
        { Name: "X-SES-CONFIGURATION-SET", Value: "my-set" },
      ]);
    });
  });

  describe("toResendHeaders", () => {
    it("should convert to Record format", () => {
      const headers: CustomEmailHeader[] = [
        { name: "X-Entity-Ref-ID", value: "unique-id" },
      ];
      const result = toResendHeaders(headers);
      expect(result).toEqual({ "X-Entity-Ref-ID": "unique-id" });
    });
  });

  describe("resolveHeaderTemplates", () => {
    it("should resolve template variables in values", () => {
      const headers: CustomEmailHeader[] = [
        { name: "X-Campaign-ID", value: "{{campaignId}}" },
        { name: "X-User", value: "user-{{userId}}" },
      ];
      const variables = {
        campaignId: "camp-123",
        userId: "456",
      };
      const result = resolveHeaderTemplates(headers, variables);
      expect(result[0].value).toBe("camp-123");
      expect(result[1].value).toBe("user-456");
    });

    it("should handle variables with spaces in braces", () => {
      const headers: CustomEmailHeader[] = [
        { name: "X-ID", value: "{{ myVar }}" },
      ];
      const result = resolveHeaderTemplates(headers, { myVar: "resolved" });
      expect(result[0].value).toBe("resolved");
    });

    it("should leave unresolved variables unchanged", () => {
      const headers: CustomEmailHeader[] = [
        { name: "X-ID", value: "{{unknown}}" },
      ];
      const result = resolveHeaderTemplates(headers, {});
      expect(result[0].value).toBe("{{unknown}}");
    });

    it("should not modify header names", () => {
      const headers: CustomEmailHeader[] = [
        { name: "X-Static-Name", value: "{{val}}" },
      ];
      const result = resolveHeaderTemplates(headers, { val: "resolved" });
      expect(result[0].name).toBe("X-Static-Name");
    });
  });
});
