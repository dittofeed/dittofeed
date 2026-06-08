import { buildProviderPayload, SendEmailParams } from "../emailWithHeaders";

describe("buildProviderPayload", () => {
  const baseParams: Omit<SendEmailParams, "provider"> = {
    to: "recipient@example.com",
    from: "sender@example.com",
    subject: "Test Email",
    html: "<p>Hello</p>",
    text: "Hello",
    headers: [
      { name: "X-PM-Message-Stream", value: "broadcast" },
      { name: "X-Custom", value: "custom-value" },
    ],
  };

  it("should build SMTP payload with headers", () => {
    const result = buildProviderPayload({ ...baseParams, provider: "smtp" }) as any;
    expect(result.headers["X-PM-Message-Stream"]).toBe("broadcast");
    expect(result.headers["X-Custom"]).toBe("custom-value");
    expect(result.to).toBe("recipient@example.com");
  });

  it("should build SendGrid payload with headers", () => {
    const result = buildProviderPayload({ ...baseParams, provider: "sendgrid" }) as any;
    expect(result.headers["X-PM-Message-Stream"]).toBe("broadcast");
    expect(result.headers["X-Custom"]).toBe("custom-value");
  });

  it("should build Postmark payload with MessageStream", () => {
    const result = buildProviderPayload({ ...baseParams, provider: "postmark" }) as any;
    expect(result.MessageStream).toBe("broadcast");
    expect(result.Headers).toEqual([{ Name: "X-Custom", Value: "custom-value" }]);
    expect(result.To).toBe("recipient@example.com");
  });

  it("should build SES payload with headers", () => {
    const result = buildProviderPayload({ ...baseParams, provider: "ses" }) as any;
    expect(result.Headers).toContainEqual({ Name: "X-PM-Message-Stream", Value: "broadcast" });
    expect(result.Headers).toContainEqual({ Name: "X-Custom", Value: "custom-value" });
  });

  it("should build Resend payload with headers", () => {
    const result = buildProviderPayload({ ...baseParams, provider: "resend" }) as any;
    expect(result.headers["X-PM-Message-Stream"]).toBe("broadcast");
    expect(result.headers["X-Custom"]).toBe("custom-value");
  });

  it("should work without custom headers", () => {
    const params = { ...baseParams, headers: [], provider: "postmark" as const };
    const result = buildProviderPayload(params) as any;
    expect(result.MessageStream).toBeUndefined();
    expect(result.Headers).toBeUndefined();
  });

  it("should throw for unsupported provider", () => {
    expect(() =>
      buildProviderPayload({ ...baseParams, provider: "unknown" as any })
    ).toThrow("Unsupported provider: unknown");
  });
});
