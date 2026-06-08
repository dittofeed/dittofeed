import {
  applyHeadersToSmtp,
  applyHeadersToSendGrid,
  applyHeadersToPostmark,
  applyHeadersToSes,
  applyHeadersToResend,
  applyCustomHeaders,
} from "../customHeaders";
import {
  CustomEmailHeaders,
  headersArrayToRecord,
  headersRecordToArray,
  validateAndSanitizeHeaders,
} from "@dittofeed/isomorphic-lib/src/emailHeaders";

describe("Custom Email Headers", () => {
  const sampleHeaders: CustomEmailHeaders = [
    { name: "X-PM-Message-Stream", value: "broadcast" },
    { name: "X-Custom-Tag", value: "marketing" },
  ];

  describe("headersArrayToRecord", () => {
    it("should convert headers array to record", () => {
      const result = headersArrayToRecord(sampleHeaders);
      expect(result).toEqual({
        "X-PM-Message-Stream": "broadcast",
        "X-Custom-Tag": "marketing",
      });
    });

    it("should return empty object for empty array", () => {
      const result = headersArrayToRecord([]);
      expect(result).toEqual({});
    });
  });

  describe("headersRecordToArray", () => {
    it("should convert record to headers array", () => {
      const record = {
        "X-PM-Message-Stream": "broadcast",
        "X-Custom-Tag": "marketing",
      };
      const result = headersRecordToArray(record);
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        name: "X-PM-Message-Stream",
        value: "broadcast",
      });
      expect(result).toContainEqual({
        name: "X-Custom-Tag",
        value: "marketing",
      });
    });
  });

  describe("validateAndSanitizeHeaders", () => {
    it("should accept valid headers", () => {
      const result = validateAndSanitizeHeaders(sampleHeaders);
      expect(result).toEqual(sampleHeaders);
    });

    it("should reject headers without X- prefix", () => {
      const invalid = [{ name: "Content-Type", value: "text/html" }];
      const result = validateAndSanitizeHeaders(invalid);
      expect(result).toEqual([]);
    });

    it("should reject empty header names", () => {
      const invalid = [{ name: "", value: "test" }];
      const result = validateAndSanitizeHeaders(invalid);
      expect(result).toEqual([]);
    });

    it("should reject non-array input", () => {
      const result = validateAndSanitizeHeaders("invalid");
      expect(result).toEqual([]);
    });

    it("should reject null input", () => {
      const result = validateAndSanitizeHeaders(null);
      expect(result).toEqual([]);
    });

    it("should reject undefined input", () => {
      const result = validateAndSanitizeHeaders(undefined);
      expect(result).toEqual([]);
    });
  });

  describe("applyHeadersToSmtp", () => {
    it("should add headers to SMTP mail options", () => {
      const mailOptions = {
        from: "test@example.com",
        to: "user@example.com",
        subject: "Test",
      };
      const result = applyHeadersToSmtp(mailOptions, sampleHeaders);
      expect(result.headers).toEqual({
        "X-PM-Message-Stream": "broadcast",
        "X-Custom-Tag": "marketing",
      });
    });

    it("should merge with existing headers", () => {
      const mailOptions = {
        from: "test@example.com",
        headers: { "X-Existing": "value" },
      };
      const result = applyHeadersToSmtp(mailOptions, sampleHeaders);
      expect(result.headers).toEqual({
        "X-Existing": "value",
        "X-PM-Message-Stream": "broadcast",
        "X-Custom-Tag": "marketing",
      });
    });

    it("should return unchanged options for empty headers", () => {
      const mailOptions = { from: "test@example.com" };
      const result = applyHeadersToSmtp(mailOptions, []);
      expect(result).toEqual(mailOptions);
    });
  });

  describe("applyHeadersToSendGrid", () => {
    it("should add headers to SendGrid message", () => {
      const message = {
        to: "user@example.com",
        from: "test@example.com",
        subject: "Test",
        text: "Hello",
      };
      const result = applyHeadersToSendGrid(message as any, sampleHeaders);
      expect(result.headers).toEqual({
        "X-PM-Message-Stream": "broadcast",
        "X-Custom-Tag": "marketing",
      });
    });
  });

  describe("applyHeadersToPostmark", () => {
    it("should handle X-PM-Message-Stream specially", () => {
      const message = {
        From: "test@example.com",
        To: "user@example.com",
        Subject: "Test",
      };
      const result = applyHeadersToPostmark(message, sampleHeaders);
      expect(result.MessageStream).toBe("broadcast");
      expect(result.Headers).toEqual([
        { Name: "X-Custom-Tag", Value: "marketing" },
      ]);
    });

    it("should append to existing Postmark headers", () => {
      const message = {
        From: "test@example.com",
        Headers: [{ Name: "X-Existing", Value: "existing" }],
      };
      const headers: CustomEmailHeaders = [
        { name: "X-New-Header", value: "new-value" },
      ];
      const result = applyHeadersToPostmark(message, headers);
      expect(result.Headers).toEqual([
        { Name: "X-Existing", Value: "existing" },
        { Name: "X-New-Header", Value: "new-value" },
      ]);
    });

    it("should return unchanged message for empty headers", () => {
      const message = { From: "test@example.com" };
      const result = applyHeadersToPostmark(message, []);
      expect(result).toEqual(message);
    });
  });

  describe("applyHeadersToResend", () => {
    it("should add headers to Resend message", () => {
      const message = {
        from: "test@example.com",
        to: "user@example.com",
        subject: "Test",
      };
      const result = applyHeadersToResend(message, sampleHeaders);
      expect(result.headers).toEqual({
        "X-PM-Message-Stream": "broadcast",
        "X-Custom-Tag": "marketing",
      });
    });
  });

  describe("applyCustomHeaders", () => {
    it("should route to correct provider handler", () => {
      const message = { from: "test@example.com" };

      const smtpResult = applyCustomHeaders("Smtp", message, sampleHeaders);
      expect(smtpResult.headers).toBeDefined();

      const postmarkResult = applyCustomHeaders(
        "Postmark",
        { From: "test@example.com" },
        sampleHeaders
      );
      expect(postmarkResult.MessageStream).toBe("broadcast");
    });

    it("should handle invalid headers gracefully", () => {
      const message = { from: "test@example.com" };
      const result = applyCustomHeaders("Smtp", message, null);
      expect(result).toEqual(message);
    });

    it("should handle unknown provider type", () => {
      const message = { from: "test@example.com" };
      const result = applyCustomHeaders("Unknown", message, sampleHeaders);
      expect(result).toEqual(message);
    });
  });
});
