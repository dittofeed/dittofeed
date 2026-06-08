import { describe, it, expect } from "vitest";
import {
  EmailHeaderSchema,
  EmailHeadersSchema,
  headersToRecord,
  validateHeaders,
  BLOCKED_HEADER_NAMES,
} from "./emailHeaders";

describe("EmailHeaderSchema", () => {
  it("accepts valid header", () => {
    const result = EmailHeaderSchema.safeParse({
      name: "X-PM-Message-Stream",
      value: "broadcast",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = EmailHeaderSchema.safeParse({ name: "", value: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects name with invalid characters", () => {
    const result = EmailHeaderSchema.safeParse({
      name: "X Header Invalid",
      value: "test",
    });
    expect(result.success).toBe(false);
  });

  it("accepts hyphenated names", () => {
    const result = EmailHeaderSchema.safeParse({
      name: "X-Custom-Header",
      value: "value",
    });
    expect(result.success).toBe(true);
  });
});

describe("EmailHeadersSchema", () => {
  it("accepts undefined", () => {
    const result = EmailHeadersSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it("accepts empty array", () => {
    const result = EmailHeadersSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it("accepts valid headers array", () => {
    const result = EmailHeadersSchema.safeParse([
      { name: "X-PM-Message-Stream", value: "broadcast" },
      { name: "X-Custom", value: "value" },
    ]);
    expect(result.success).toBe(true);
  });
});

describe("headersToRecord", () => {
  it("returns undefined for empty input", () => {
    expect(headersToRecord(undefined)).toBeUndefined();
    expect(headersToRecord([])).toBeUndefined();
  });

  it("converts headers to record", () => {
    const result = headersToRecord([
      { name: "X-PM-Message-Stream", value: "broadcast" },
      { name: "X-Priority", value: "1" },
    ]);
    expect(result).toEqual({
      "X-PM-Message-Stream": "broadcast",
      "X-Priority": "1",
    });
  });
});

describe("validateHeaders", () => {
  it("returns valid for empty input", () => {
    expect(validateHeaders(undefined)).toEqual({ valid: true, errors: [] });
    expect(validateHeaders([])).toEqual({ valid: true, errors: [] });
  });

  it("returns valid for allowed headers", () => {
    const result = validateHeaders([
      { name: "X-PM-Message-Stream", value: "broadcast" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns invalid for blocked headers", () => {
    const result = validateHeaders([
      { name: "From", value: "attacker@evil.com" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("checks case insensitively", () => {
    const result = validateHeaders([
      { name: "SUBJECT", value: "override" },
    ]);
    expect(result.valid).toBe(false);
  });
});
