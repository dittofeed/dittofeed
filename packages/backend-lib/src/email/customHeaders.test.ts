import {
  parseCustomHeaders,
  headersToMap,
  headersToPostmarkFormat,
  headersToSendGridFormat,
  headersToSESFormat,
  validateHeaderName,
  validateHeaderValue,
  sanitizeHeaders,
  renderHeaderValues,
  CustomEmailHeader,
} from "./customHeaders";

describe("parseCustomHeaders", () => {
  it("should return empty array for null/undefined input", () => {
    expect(parseCustomHeaders(null)).toEqual([]);
    expect(parseCustomHeaders(undefined)).toEqual([]);
  });

  it("should return empty array for non-array input", () => {
    expect(parseCustomHeaders("string")).toEqual([]);
    expect(parseCustomHeaders(123)).toEqual([]);
    expect(parseCustomHeaders({})).toEqual([]);
  });

  it("should parse valid headers", () => {
    const input = [
      { name: "X-PM-Message-Stream", value: "broadcast" },
      { name: "X-Custom-Header", value: "test-value" },
    ];
    expect(parseCustomHeaders(input)).toEqual(input);
  });

  it("should filter out invalid entries", () => {
    const input = [
      { name: "X-Valid", value: "yes" },
      { name: "", value: "empty-name" },
      { name: 123, value: "number-name" },
      { name: "X-No-Value" },
      null,
      "not-an-object",
    ];
    expect(parseCustomHeaders(input)).toEqual([
      { name: "X-Valid", value: "yes" },
    ]);
  });
});

describe("headersToMap", () => {
  it("should convert headers array to plain object", () => {
    const headers: CustomEmailHeader[] = [
      { name: "X-PM-Message-Stream", value: "broadcast" },
      { name: "X-Priority", value: "1" },
    ];
    expect(headersToMap(headers)).toEqual({
      "X-PM-Message-Stream": "broadcast",
      "X-Priority": "1",
    });
  });

  it("should handle empty array", () => {
    expect(headersToMap([])).toEqual({});
  });

  it("should use last value for duplicate header names", () => {
    const headers: CustomEmailHeader[] = [
      { name: "X-Duplicate", value: "first" },
      { name: "X-Duplicate", value: "second" },
    ];
    expect(headersToMap(headers)).toEqual({
      "X-Duplicate": "second",
    });
  });
});

describe("headersToPostmarkFormat", () => {
  it("should convert to Postmark format with Name/Value keys", () => {
    const headers: CustomEmailHeader[] = [
      { name: "X-PM-Message-Stream", value: "broadcast" },
    ];
    expect(headersToPostmarkFormat(headers)).toEqual([
      { Name: "X-PM-Message-Stream", Value: "broadcast" },
    ]);
  });
});

describe("headersToSendGridFormat", () => {
  it("should convert to SendGrid format (plain object)", () => {
    const headers: CustomEmailHeader[] = [
      { name: "X-Custom", value: "test" },
    ];
    expect(headersToSendGridFormat(headers)).toEqual({
      "X-Custom": "test",
    });
  });
});

describe("headersToSESFormat", () => {
  it("should convert to SES format", () => {
    const headers: CustomEmailHeader[] = [
      { name: "X-SES-Tag", value: "campaign=test" },
    ];
    expect(headersToSESFormat(headers)).toEqual([
      { Name: "X-SES-Tag", Value: "campaign=test" },
    ]);
  });
});

describe("validateHeaderName", () => {
  it("should accept valid header names", () => {
    expect(validateHeaderName("X-Custom-Header")).toBe(true);
    expect(validateHeaderName("X-PM-Message-Stream")).toBe(true);
    expect(validateHeaderName("Content-Type")).toBe(true);
  });

  it("should reject header names with colons", () => {
    expect(validateHeaderName("X-Bad:Header")).toBe(false);
  });

  it("should reject header names with spaces", () => {
    expect(validateHeaderName("X Bad Header")).toBe(false);
  });

  it("should reject empty header names", () => {
    expect(validateHeaderName("")).toBe(false);
  });

  it("should reject header names with control characters", () => {
    expect(validateHeaderName("X-Bad\x00Header")).toBe(false);
    expect(validateHeaderName("X-Bad\x1FHeader")).toBe(false);
  });
});

describe("validateHeaderValue", () => {
  it("should accept valid header values", () => {
    expect(validateHeaderValue("broadcast")).toBe(true);
    expect(validateHeaderValue("some value with spaces")).toBe(true);
    expect(validateHeaderValue("value-with-special_chars.123")).toBe(true);
  });

  it("should reject values with CR", () => {
    expect(validateHeaderValue("bad\rvalue")).toBe(false);
  });

  it("should reject values with LF", () => {
    expect(validateHeaderValue("bad\nvalue")).toBe(false);
  });

  it("should reject values with CRLF", () => {
    expect(validateHeaderValue("bad\r\nvalue")).toBe(false);
  });
});

describe("sanitizeHeaders", () => {
  it("should return only valid headers", () => {
    const headers: CustomEmailHeader[] = [
      { name: "X-Valid", value: "good" },
      { name: "X Bad Name", value: "rejected" },
      { name: "X-Good-Name", value: "bad\nvalue" },
      { name: "X-Also-Valid", value: "also good" },
    ];
    const result = sanitizeHeaders(headers);
    expect(result).toEqual([
      { name: "X-Valid", value: "good" },
      { name: "X-Also-Valid", value: "also good" },
    ]);
  });
});

describe("renderHeaderValues", () => {
  it("should replace template variables in header values", () => {
    const headers: CustomEmailHeader[] = [
      { name: "X-Campaign", value: "{{campaignId}}" },
      { name: "X-User", value: "user-{{userId}}" },
      { name: "X-Static", value: "no-vars-here" },
    ];
    const variables = {
      campaignId: "camp-123",
      userId: "user-456",
    };
    expect(renderHeaderValues(headers, variables)).toEqual([
      { name: "X-Campaign", value: "camp-123" },
      { name: "X-User", value: "user-user-456" },
      { name: "X-Static", value: "no-vars-here" },
    ]);
  });

  it("should replace unknown variables with empty string", () => {
    const headers: CustomEmailHeader[] = [
      { name: "X-Test", value: "{{unknown}}" },
    ];
    expect(renderHeaderValues(headers, {})).toEqual([
      { name: "X-Test", value: "" },
    ]);
  });
});
