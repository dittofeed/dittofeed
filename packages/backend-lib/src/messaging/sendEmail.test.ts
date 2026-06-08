import { buildProviderPayload } from "./sendEmail";

describe("buildProviderPayload", () => {
  const baseMessage = {
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Test Email",
    html: "<p>Hello</p>",
    headers: [
      { name: "X-PM-Message-Stream", value: "broadcast" },
      { name: "X-Custom", value: "test-value" },
    ],
  };

  describe("smtp provider", () => {
    it("should include headers as a plain object", () => {
      const result = buildProviderPayload({
        message: baseMessage,
        provider: "smtp",
      });
      expect(result).toEqual({
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Test Email",
        html: "<p>Hello</p>",
        replyTo: undefined,
        headers: {
          "X-PM-Message-Stream": "broadcast",
          "X-Custom": "test-value",
        },
      });
    });
  });

  describe("postmark provider", () => {
    it("should include headers in Postmark format", () => {
      const result = buildProviderPayload({
        message: baseMessage,
        provider: "postmark",
      }) as Record<string, unknown>;
      expect(result.Headers).toEqual([
        { Name: "X-PM-Message-Stream", Value: "broadcast" },
        { Name: "X-Custom", Value: "test-value" },
      ]);
    });

    it("should set MessageStream from X-PM-Message-Stream header", () => {
      const result = buildProviderPayload({
        message: baseMessage,
        provider: "postmark",
      }) as Record<string, unknown>;
      expect(result.MessageStream).toBe("broadcast");
    });
  });

  describe("sendgrid provider", () => {
    it("should include headers in personalizations", () => {
      const result = buildProviderPayload({
        message: baseMessage,
        provider: "sendgrid",
      }) as Record<string, unknown>;
      const personalizations = result.personalizations as Array<Record<string, unknown>>;
      expect(personalizations[0].headers).toEqual({
        "X-PM-Message-Stream": "broadcast",
        "X-Custom": "test-value",
      });
    });
  });

  describe("resend provider", () => {
    it("should include headers as plain object", () => {
      const result = buildProviderPayload({
        message: baseMessage,
        provider: "resend",
      }) as Record<string, unknown>;
      expect(result.headers).toEqual({
        "X-PM-Message-Stream": "broadcast",
        "X-Custom": "test-value",
      });
    });
  });

  describe("template variables", () => {
    it("should render template variables in header values", () => {
      const message = {
        ...baseMessage,
        headers: [
          { name: "X-Campaign", value: "{{campaignId}}" },
        ],
      };
      const result = buildProviderPayload({
        message,
        provider: "smtp",
        templateVariables: { campaignId: "camp-123" },
      }) as Record<string, unknown>;
      expect(result.headers).toEqual({
        "X-Campaign": "camp-123",
      });
    });
  });

  describe("no headers", () => {
    it("should handle message with no headers", () => {
      const message = {
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Test",
        html: "<p>Hi</p>",
      };
      const result = buildProviderPayload({
        message,
        provider: "smtp",
      }) as Record<string, unknown>;
      expect(result.headers).toEqual({});
    });
  });
});
