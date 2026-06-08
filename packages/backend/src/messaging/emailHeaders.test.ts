import { describe, it, expect } from "vitest";
import {
  prepareSmtpHeaders,
  prepareSendGridHeaders,
  preparePostmarkHeaders,
  prepareSesHeaders,
  prepareResendHeaders,
} from "./emailHeaders";

describe("prepareSmtpHeaders", () => {
  it("returns undefined for no headers", () => {
    expect(prepareSmtpHeaders(undefined)).toBeUndefined();
    expect(prepareSmtpHeaders([])).toBeUndefined();
  });

  it("returns record for valid headers", () => {
    const result = prepareSmtpHeaders([
      { name: "X-PM-Message-Stream", value: "broadcast" },
    ]);
    expect(result).toEqual({ "X-PM-Message-Stream": "broadcast" });
  });

  it("filters blocked headers", () => {
    const result = prepareSmtpHeaders([
      { name: "X-Custom", value: "allowed" },
      { name: "From", value: "blocked" },
    ]);
    expect(result).toEqual({ "X-Custom": "allowed" });
  });
});

describe("preparePostmarkHeaders", () => {
  it("returns undefined for no headers", () => {
    expect(preparePostmarkHeaders(undefined)).toBeUndefined();
    expect(preparePostmarkHeaders([])).toBeUndefined();
  });

  it("returns Postmark-formatted headers", () => {
    const result = preparePostmarkHeaders([
      { name: "X-PM-Message-Stream", value: "broadcast" },
      { name: "X-PM-Tag", value: "welcome" },
    ]);
    expect(result).toEqual([
      { Name: "X-PM-Message-Stream", Value: "broadcast" },
      { Name: "X-PM-Tag", Value: "welcome" },
    ]);
  });

  it("filters blocked headers", () => {
    const result = preparePostmarkHeaders([
      { name: "X-PM-Message-Stream", value: "broadcast" },
      { name: "Subject", value: "blocked" },
    ]);
    expect(result).toEqual([
      { Name: "X-PM-Message-Stream", Value: "broadcast" },
    ]);
  });
});

describe("prepareSendGridHeaders", () => {
  it("works like SMTP headers", () => {
    const result = prepareSendGridHeaders([
      { name: "X-Custom-Id", value: "12345" },
    ]);
    expect(result).toEqual({ "X-Custom-Id": "12345" });
  });
});

describe("prepareSesHeaders", () => {
  it("works like SMTP headers", () => {
    const result = prepareSesHeaders([
      { name: "X-SES-CONFIGURATION-SET", value: "my-set" },
    ]);
    expect(result).toEqual({ "X-SES-CONFIGURATION-SET": "my-set" });
  });
});

describe("prepareResendHeaders", () => {
  it("works like SMTP headers", () => {
    const result = prepareResendHeaders([
      { name: "X-Entity-Ref-ID", value: "abc123" },
    ]);
    expect(result).toEqual({ "X-Entity-Ref-ID": "abc123" });
  });
});
