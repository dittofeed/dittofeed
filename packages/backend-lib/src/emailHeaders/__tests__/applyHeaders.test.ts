import {
  applyHeadersToSmtp,
  applyHeadersToSendGrid,
  applyHeadersToPostmark,
  applyHeadersToSes,
  applyHeadersToResend,
} from "../applyHeaders";
import { EmailHeader } from "isomorphic-lib/src/emailHeaders";

describe("applyHeadersToSmtp", () => {
  it("should add custom headers to SMTP mail options", () => {
    const headers: EmailHeader[] = [
      { name: "X-Custom-Header", value: "test-value" },
      { name: "X-Another", value: "another-value" },
    ];
    const result = applyHeadersToSmtp({ subject: "Test" }, headers);
    expect(result.headers).toEqual({
      "X-Custom-Header": "test-value",
      "X-Another": "another-value",
    });
  });

  it("should merge with existing headers", () => {
    const headers: EmailHeader[] = [{ name: "X-New", value: "new" }];
    const result = applyHeadersToSmtp(
      { headers: { "X-Existing": "existing" } },
      headers
    );
    expect(result.headers).toEqual({
      "X-Existing": "existing",
      "X-New": "new",
    });
  });

  it("should return unchanged options when no headers", () => {
    const opts = { subject: "Test" };
    const result = applyHeadersToSmtp(opts, []);
    expect(result).toEqual(opts);
  });
});

describe("applyHeadersToSendGrid", () => {
  it("should add headers to SendGrid mail data", () => {
    const headers: EmailHeader[] = [
      { name: "X-Custom", value: "value" },
    ];
    const result = applyHeadersToSendGrid(
      { personalizations: [{ to: [{ email: "test@test.com" }] }] },
      headers
    );
    expect(result.headers).toEqual({ "X-Custom": "value" });
  });
});

describe("applyHeadersToPostmark", () => {
  it("should handle X-PM-Message-Stream header specially", () => {
    const headers: EmailHeader[] = [
      { name: "X-PM-Message-Stream", value: "broadcast" },
      { name: "X-Custom", value: "value" },
    ];
    const result = applyHeadersToPostmark({}, headers);
    expect(result.MessageStream).toBe("broadcast");
    expect(result.Headers).toEqual([{ Name: "X-Custom", Value: "value" }]);
  });

  it("should handle case-insensitive X-PM-Message-Stream", () => {
    const headers: EmailHeader[] = [
      { name: "x-pm-message-stream", value: "outbound" },
    ];
    const result = applyHeadersToPostmark({}, headers);
    expect(result.MessageStream).toBe("outbound");
  });

  it("should preserve existing headers", () => {
    const headers: EmailHeader[] = [{ name: "X-New", value: "new" }];
    const result = applyHeadersToPostmark(
      { Headers: [{ Name: "X-Existing", Value: "existing" }] },
      headers
    );
    expect(result.Headers).toEqual([
      { Name: "X-Existing", Value: "existing" },
      { Name: "X-New", Value: "new" },
    ]);
  });

  it("should return unchanged message when no headers", () => {
    const msg = { To: "test@test.com" };
    const result = applyHeadersToPostmark(msg, []);
    expect(result).toEqual(msg);
  });
});

describe("applyHeadersToSes", () => {
  it("should add headers in SES format", () => {
    const headers: EmailHeader[] = [
      { name: "X-SES-Custom", value: "value" },
    ];
    const result = applyHeadersToSes({}, headers);
    expect(result.Headers).toEqual([{ Name: "X-SES-Custom", Value: "value" }]);
  });
});

describe("applyHeadersToResend", () => {
  it("should add headers to Resend message", () => {
    const headers: EmailHeader[] = [
      { name: "X-Entity-Ref-ID", value: "unique-id" },
    ];
    const result = applyHeadersToResend({}, headers);
    expect(result.headers).toEqual({ "X-Entity-Ref-ID": "unique-id" });
  });
});
