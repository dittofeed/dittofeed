import { err } from "neverthrow";
import { DefaultResponse } from "postmark/dist/client/models/client/DefaultResponse";

import { sendMail } from "./postmark";

// Create a completely mocked module
jest.mock("./postmark");

describe("postmark", () => {
  describe("sendMail", () => {
    describe("when the operation fails", () => {
      it("should return an error result", async () => {
        // Setup mock implementation for this test
        const mockErrorResponse: DefaultResponse = {
          ErrorCode: 11,
          Message: "Test error message",
        };

        // Mock the implementation for this test only
        (sendMail as jest.Mock).mockResolvedValue(err(mockErrorResponse));

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
    });
  });
});
