import { DefaultResponse } from "postmark/dist/client/models/client/DefaultResponse";
import { MESSAGE_METADATA_FIELDS } from "../constants";

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

    describe("metadata sanitization", () => {
      it("should sanitize metadata with more than 10 fields", async () => {
        const mockSendEmail = jest.fn().mockResolvedValue({
          ErrorCode: 0,
          Message: "OK",
        });

        jest.doMock("postmark", () => {
          return {
            ServerClient: jest.fn().mockImplementation(() => ({
              sendEmail: mockSendEmail,
            })),
          };
        });

        const { sendMail } = await import("./postmark");

        await sendMail({
          apiKey: "fake-api-key",
          mailData: {
            From: "test@example.com",
            To: "recipient@example.com",
            Subject: "Test",
            Metadata: {
              // Priority fields (MESSAGE_METADATA_FIELDS)
              workspaceId: "ws-123",
              userId: "user-123",
              messageId: "msg-123",
              templateId: "tpl-123",
              journeyId: "jrn-123",
              broadcastId: "brd-123",
              runId: "run-123",
              nodeId: "node-123",
              // Extra fields (these should be dropped)
              extra1: "value1",
              extra2: "value2",
              extra3: "value3",
            },
          },
        });

        // Should only keep first 10 fields (all 8 priority + 2 extra)
        const sentMetadata = mockSendEmail.mock.calls[0][0].Metadata;
        expect(Object.keys(sentMetadata)).toHaveLength(10);

        // All MESSAGE_METADATA_FIELDS should be present
        MESSAGE_METADATA_FIELDS.forEach((field) => {
          expect(sentMetadata).toHaveProperty(field);
        });
      });

      it("should drop fields with keys longer than 20 characters", async () => {
        const mockSendEmail = jest.fn().mockResolvedValue({
          ErrorCode: 0,
          Message: "OK",
        });

        jest.doMock("postmark", () => {
          return {
            ServerClient: jest.fn().mockImplementation(() => ({
              sendEmail: mockSendEmail,
            })),
          };
        });

        const { sendMail } = await import("./postmark");

        await sendMail({
          apiKey: "fake-api-key",
          mailData: {
            From: "test@example.com",
            To: "recipient@example.com",
            Subject: "Test",
            Metadata: {
              workspaceId: "ws-123",
              thisKeyIsWayTooLongForPostmark: "value",
            },
          },
        });

        const sentMetadata = mockSendEmail.mock.calls[0][0].Metadata;
        expect(sentMetadata).toHaveProperty("workspaceId");
        expect(sentMetadata).not.toHaveProperty("thisKeyIsWayTooLongForPostmark");
      });

      it("should drop fields with values longer than 80 characters", async () => {
        const mockSendEmail = jest.fn().mockResolvedValue({
          ErrorCode: 0,
          Message: "OK",
        });

        jest.doMock("postmark", () => {
          return {
            ServerClient: jest.fn().mockImplementation(() => ({
              sendEmail: mockSendEmail,
            })),
          };
        });

        const { sendMail } = await import("./postmark");

        const longValue = "a".repeat(100);

        await sendMail({
          apiKey: "fake-api-key",
          mailData: {
            From: "test@example.com",
            To: "recipient@example.com",
            Subject: "Test",
            Metadata: {
              workspaceId: "ws-123",
              longField: longValue,
            },
          },
        });

        const sentMetadata = mockSendEmail.mock.calls[0][0].Metadata;
        expect(sentMetadata).toHaveProperty("workspaceId");
        expect(sentMetadata).not.toHaveProperty("longField");
      });

      it("should prioritize MESSAGE_METADATA_FIELDS over other fields", async () => {
        const mockSendEmail = jest.fn().mockResolvedValue({
          ErrorCode: 0,
          Message: "OK",
        });

        jest.doMock("postmark", () => {
          return {
            ServerClient: jest.fn().mockImplementation(() => ({
              sendEmail: mockSendEmail,
            })),
          };
        });

        const { sendMail } = await import("./postmark");

        await sendMail({
          apiKey: "fake-api-key",
          mailData: {
            From: "test@example.com",
            To: "recipient@example.com",
            Subject: "Test",
            Metadata: {
              // Add 5 non-priority fields first
              extra1: "value1",
              extra2: "value2",
              extra3: "value3",
              extra4: "value4",
              extra5: "value5",
              // Then add MESSAGE_METADATA_FIELDS
              workspaceId: "ws-123",
              userId: "user-123",
              messageId: "msg-123",
              templateId: "tpl-123",
              journeyId: "jrn-123",
              broadcastId: "brd-123",
              runId: "run-123",
              nodeId: "node-123",
            },
          },
        });

        const sentMetadata = mockSendEmail.mock.calls[0][0].Metadata;
        expect(Object.keys(sentMetadata)).toHaveLength(10);

        // All MESSAGE_METADATA_FIELDS should be present
        MESSAGE_METADATA_FIELDS.forEach((field) => {
          expect(sentMetadata).toHaveProperty(field);
        });

        // Only 2 extra fields should be kept (8 priority + 2 extra = 10 total)
        const extraFieldCount = Object.keys(sentMetadata).filter(
          (key) => key.startsWith("extra"),
        ).length;
        expect(extraFieldCount).toBe(2);
      });

      it("should handle undefined metadata", async () => {
        const mockSendEmail = jest.fn().mockResolvedValue({
          ErrorCode: 0,
          Message: "OK",
        });

        jest.doMock("postmark", () => {
          return {
            ServerClient: jest.fn().mockImplementation(() => ({
              sendEmail: mockSendEmail,
            })),
          };
        });

        const { sendMail } = await import("./postmark");

        await sendMail({
          apiKey: "fake-api-key",
          mailData: {
            From: "test@example.com",
            To: "recipient@example.com",
            Subject: "Test",
          },
        });

        const sentMetadata = mockSendEmail.mock.calls[0][0].Metadata;
        expect(sentMetadata).toBeUndefined();
      });

      it("should handle empty metadata", async () => {
        const mockSendEmail = jest.fn().mockResolvedValue({
          ErrorCode: 0,
          Message: "OK",
        });

        jest.doMock("postmark", () => {
          return {
            ServerClient: jest.fn().mockImplementation(() => ({
              sendEmail: mockSendEmail,
            })),
          };
        });

        const { sendMail } = await import("./postmark");

        await sendMail({
          apiKey: "fake-api-key",
          mailData: {
            From: "test@example.com",
            To: "recipient@example.com",
            Subject: "Test",
            Metadata: {},
          },
        });

        const sentMetadata = mockSendEmail.mock.calls[0][0].Metadata;
        expect(sentMetadata).toBeUndefined();
      });
    });
  });
});
