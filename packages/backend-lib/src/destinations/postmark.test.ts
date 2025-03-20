import { ServerClient } from "postmark";
import { DefaultResponse } from "postmark/dist/client/models/client/DefaultResponse";

import { sendMail } from "./postmark";

jest.mock("postmark", () => ({
  ServerClient: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn(),
  })),
}));

describe("postmark", () => {
  describe("sendMail", () => {
    describe("when the operation fails", () => {
      it("should return an error result", async () => {
        // Arrange
        const mockErrorResponse: DefaultResponse = {
          ErrorCode: 11,
          Message: "Test error message",
        };

        const mockServerClient = new ServerClient("fake-api-key");
        (mockServerClient.sendEmail as jest.Mock).mockResolvedValue(
          mockErrorResponse,
        );

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
          (error) => {
            expect(error.ErrorCode).toBe(11);
            expect(error.Message).toBe("Test error message");
          },
        );
      });
    });
  });
});
