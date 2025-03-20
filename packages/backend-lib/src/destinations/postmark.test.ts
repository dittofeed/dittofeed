import { DefaultResponse } from "postmark/dist/client/models/client/DefaultResponse";

describe("postmark", () => {
  // Reset modules before each test to clear module cache
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("sendMail", () => {
    describe("when the operation fails", () => {
      it("should return an error result when Postmark returns an error", async () => {
        // Setup mock error response
        const mockErrorResponse: DefaultResponse = {
          ErrorCode: 11,
          Message: "Test error message",
        };

        // Mock the module before importing
        jest.doMock("postmark", () => {
          return {
            ServerClient: jest.fn().mockImplementation(() => ({
              sendEmail: jest.fn().mockResolvedValue(mockErrorResponse),
            })),
          };
        });

        // Import the module with the mock applied
        const { sendMail } = await import("./postmark");

        // Act
        const result = await sendMail({
          apiKey: "fake-api-key",
          mailData: {
            From: "test@example.com",
            To: "recipient@example.com",
            Subject: "Test",
          },
        });

        // Assert
        expect(result.isErr()).toBe(true);
        result.match(
          () => fail("Expected error result"),
          (errorResult) => {
            expect(errorResult.ErrorCode).toBe(11);
            expect(errorResult.Message).toBe("Test error message");
          },
        );
      });

      it("should propagate errors thrown by the Postmark client", async () => {
        // Setup the error
        const errorMessage = "Test error message";
        const thrownError = new Error(errorMessage);

        // Mock the module before importing
        jest.doMock("postmark", () => {
          return {
            ServerClient: jest.fn().mockImplementation(() => ({
              sendEmail: jest.fn().mockRejectedValue(thrownError),
            })),
          };
        });

        // Import the module with the mock applied
        const { sendMail } = await import("./postmark");

        // Act & Assert
        await expect(
          sendMail({
            apiKey: "fake-api-key",
            mailData: {
              From: "test@example.com",
              To: "recipient@example.com",
              Subject: "Test",
            },
          }),
        ).rejects.toThrow(thrownError);
      });
    });
  });
});
