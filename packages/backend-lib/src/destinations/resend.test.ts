describe("resend", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("sendMail", () => {
    describe("when the operation succeeds", () => {
      it("should return an ok result with the response", async () => {
        const mockResponse = {
          data: { id: "email_123" },
          error: null,
        };

        jest.doMock("resend", () => {
          return {
            Resend: jest.fn().mockImplementation(() => ({
              emails: {
                send: jest.fn().mockResolvedValue(mockResponse),
              },
            })),
          };
        });

        const { sendMail } = await import("./resend");

        const result = await sendMail({
          apiKey: "re_test_key",
          mailData: {
            from: "sender@example.com",
            to: "recipient@example.com",
            subject: "Test Subject",
            html: "<p>Hello</p>",
          },
        });

        expect(result.isOk()).toBe(true);
        result.match(
          (response) => {
            expect(response.data?.id).toBe("email_123");
          },
          () => fail("Expected ok result"),
        );
      });
    });

    describe("when the Resend API returns an error", () => {
      it("should return an err result with the error details", async () => {
        const mockResponse = {
          data: null,
          error: {
            message: "Invalid API key",
            name: "invalid_api_Key" as const,
          },
        };

        jest.doMock("resend", () => {
          return {
            Resend: jest.fn().mockImplementation(() => ({
              emails: {
                send: jest.fn().mockResolvedValue(mockResponse),
              },
            })),
          };
        });

        const { sendMail } = await import("./resend");

        const result = await sendMail({
          apiKey: "re_bad_key",
          mailData: {
            from: "sender@example.com",
            to: "recipient@example.com",
            subject: "Test Subject",
            html: "<p>Hello</p>",
          },
        });

        expect(result.isErr()).toBe(true);
        result.match(
          () => fail("Expected error result"),
          (error) => {
            expect(error.name).toBe("invalid_api_Key");
            expect(error.message).toBe("Invalid API key");
          },
        );
      });
    });

    describe("when the SDK throws an unexpected error", () => {
      it("should return an err result with application_error", async () => {
        jest.doMock("resend", () => {
          return {
            Resend: jest.fn().mockImplementation(() => ({
              emails: {
                send: jest
                  .fn()
                  .mockRejectedValue(new TypeError("fetch failed")),
              },
            })),
          };
        });

        const { sendMail } = await import("./resend");

        const result = await sendMail({
          apiKey: "re_test_key",
          mailData: {
            from: "sender@example.com",
            to: "recipient@example.com",
            subject: "Test Subject",
            html: "<p>Hello</p>",
          },
        });

        expect(result.isErr()).toBe(true);
        result.match(
          () => fail("Expected error result"),
          (error) => {
            expect(error.name).toBe("application_error");
            expect(error.message).toBe("fetch failed");
          },
        );
      });
    });
  });
});
