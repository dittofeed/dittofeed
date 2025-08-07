import {
  MessagesMessage,
  MessagesSendRejectResponse,
  MessagesSendSuccessResponse,
} from "@mailchimp/mailchimp_transactional";
import { AxiosError } from "axios";
import { err, ok } from "neverthrow";

import { sendMail } from "./mailchimp";

jest.mock("@mailchimp/mailchimp_transactional");

const mockMailchimp = {
  messages: {
    send: jest.fn(),
  },
};

// Mock the default export of the mailchimp module
jest.mock("@mailchimp/mailchimp_transactional", () => {
  return jest.fn(() => mockMailchimp);
});

describe("sendMail", () => {
  const apiKey = "test-api-key";
  const message: MessagesMessage = {
    to: [{ email: "test@example.com" }],
    subject: "Test Subject",
    from_email: "sender@example.com",
    metadata: {
      workspaceId: "workspace-123",
      website: "https://example.com",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("successful responses", () => {
    it("should return success for sent status", async () => {
      const successResponse: MessagesSendSuccessResponse = {
        email: "test@example.com",
        status: "sent",
        _id: "message-id-123",
        reject_reason: null,
      };

      mockMailchimp.messages.send.mockResolvedValue([successResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(ok(successResponse));
    });

    it("should return success for queued status", async () => {
      const successResponse: MessagesSendSuccessResponse = {
        email: "test@example.com",
        status: "queued",
        _id: "message-id-123",
        reject_reason: null,
      };

      mockMailchimp.messages.send.mockResolvedValue([successResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(ok(successResponse));
    });
  });

  describe("non-retryable AxiosError scenarios", () => {
    it("should return error for 400 Bad Request", async () => {
      const axiosError = new AxiosError("Bad Request");
      axiosError.response = {
        status: 400,
        statusText: "Bad Request",
        data: {},
        headers: {},
        config: {} as any,
      };

      mockMailchimp.messages.send.mockResolvedValue(axiosError);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(axiosError));
    });

    it("should return error for 401 Unauthorized", async () => {
      const axiosError = new AxiosError("Unauthorized");
      axiosError.response = {
        status: 401,
        statusText: "Unauthorized",
        data: {},
        headers: {},
        config: {} as any,
      };

      mockMailchimp.messages.send.mockResolvedValue(axiosError);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(axiosError));
    });

    it("should return error for 422 Unprocessable Entity", async () => {
      const axiosError = new AxiosError("Unprocessable Entity");
      axiosError.response = {
        status: 422,
        statusText: "Unprocessable Entity",
        data: {},
        headers: {},
        config: {} as any,
      };

      mockMailchimp.messages.send.mockResolvedValue(axiosError);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(axiosError));
    });
  });

  describe("retryable AxiosError scenarios", () => {
    it("should throw for 500 Internal Server Error", async () => {
      const axiosError = new AxiosError("Internal Server Error");
      axiosError.response = {
        status: 500,
        statusText: "Internal Server Error",
        data: {},
        headers: {},
        config: {} as any,
      };

      mockMailchimp.messages.send.mockResolvedValue(axiosError);

      await expect(sendMail({ apiKey, message })).rejects.toThrow(axiosError);
    });

    it("should throw for 502 Bad Gateway", async () => {
      const axiosError = new AxiosError("Bad Gateway");
      axiosError.response = {
        status: 502,
        statusText: "Bad Gateway",
        data: {},
        headers: {},
        config: {} as any,
      };

      mockMailchimp.messages.send.mockResolvedValue(axiosError);

      await expect(sendMail({ apiKey, message })).rejects.toThrow(axiosError);
    });

    it("should throw for 429 Rate Limit", async () => {
      const axiosError = new AxiosError("Too Many Requests");
      axiosError.response = {
        status: 429,
        statusText: "Too Many Requests",
        data: {},
        headers: {},
        config: {} as any,
      };

      mockMailchimp.messages.send.mockResolvedValue(axiosError);

      await expect(sendMail({ apiKey, message })).rejects.toThrow(axiosError);
    });

    it("should throw for network errors (no response)", async () => {
      const axiosError = new AxiosError("Network Error");
      // No response property indicates network error

      mockMailchimp.messages.send.mockResolvedValue(axiosError);

      await expect(sendMail({ apiKey, message })).rejects.toThrow(axiosError);
    });
  });

  describe("retryable network errors in catch block", () => {
    it("should throw for network AxiosError in catch", async () => {
      const axiosError = new AxiosError("Network Error");
      // No response property indicates network error

      mockMailchimp.messages.send.mockRejectedValue(axiosError);

      await expect(sendMail({ apiKey, message })).rejects.toThrow(axiosError);
    });

    it("should throw for 500 AxiosError in catch", async () => {
      const axiosError = new AxiosError("Internal Server Error");
      axiosError.response = {
        status: 500,
        statusText: "Internal Server Error",
        data: {},
        headers: {},
        config: {} as any,
      };

      mockMailchimp.messages.send.mockRejectedValue(axiosError);

      await expect(sendMail({ apiKey, message })).rejects.toThrow(axiosError);
    });

    it("should return error for 400 AxiosError in catch", async () => {
      const axiosError = new AxiosError("Bad Request");
      axiosError.response = {
        status: 400,
        statusText: "Bad Request",
        data: {},
        headers: {},
        config: {} as any,
      };

      mockMailchimp.messages.send.mockRejectedValue(axiosError);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(axiosError));
    });
  });

  describe("non-retryable rejection scenarios", () => {
    it("should return error for hard-bounce rejection", async () => {
      const rejectResponse: MessagesSendRejectResponse = {
        email: "test@example.com",
        status: "rejected",
        _id: "message-id-123",
        reject_reason: "hard-bounce",
      };

      mockMailchimp.messages.send.mockResolvedValue([rejectResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(rejectResponse));
    });

    it("should return error for invalid-sender rejection", async () => {
      const rejectResponse: MessagesSendRejectResponse = {
        email: "test@example.com",
        status: "rejected",
        _id: "message-id-123",
        reject_reason: "invalid-sender",
      };

      mockMailchimp.messages.send.mockResolvedValue([rejectResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(rejectResponse));
    });

    it("should return error for invalid rejection", async () => {
      const rejectResponse: MessagesSendRejectResponse = {
        email: "test@example.com",
        status: "rejected",
        _id: "message-id-123",
        reject_reason: "invalid",
      };

      mockMailchimp.messages.send.mockResolvedValue([rejectResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(rejectResponse));
    });

    it("should return error for test-mode-limit rejection", async () => {
      const rejectResponse: MessagesSendRejectResponse = {
        email: "test@example.com",
        status: "rejected",
        _id: "message-id-123",
        reject_reason: "test-mode-limit",
      };

      mockMailchimp.messages.send.mockResolvedValue([rejectResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(rejectResponse));
    });

    it("should return error for rule rejection", async () => {
      const rejectResponse: MessagesSendRejectResponse = {
        email: "test@example.com",
        status: "rejected",
        _id: "message-id-123",
        reject_reason: "rule",
      };

      mockMailchimp.messages.send.mockResolvedValue([rejectResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(rejectResponse));
    });
  });

  describe("retryable rejection scenarios", () => {
    it("should return error for unsigned rejection", async () => {
      const rejectResponse: MessagesSendRejectResponse = {
        email: "test@example.com",
        status: "rejected",
        _id: "message-id-123",
        reject_reason: "unsigned",
      };

      mockMailchimp.messages.send.mockResolvedValue([rejectResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(rejectResponse));
    });

    it("should return error for soft-bounce rejection", async () => {
      const rejectResponse: MessagesSendRejectResponse = {
        email: "test@example.com",
        status: "rejected",
        _id: "message-id-123",
        reject_reason: "soft-bounce",
      };

      mockMailchimp.messages.send.mockResolvedValue([rejectResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(rejectResponse));
    });

    it("should return error for spam rejection", async () => {
      const rejectResponse: MessagesSendRejectResponse = {
        email: "test@example.com",
        status: "rejected",
        _id: "message-id-123",
        reject_reason: "spam",
      };

      mockMailchimp.messages.send.mockResolvedValue([rejectResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(rejectResponse));
    });

    it("should return error for unsub rejection", async () => {
      const rejectResponse: MessagesSendRejectResponse = {
        email: "test@example.com",
        status: "rejected",
        _id: "message-id-123",
        reject_reason: "unsub",
      };

      mockMailchimp.messages.send.mockResolvedValue([rejectResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(rejectResponse));
    });

    it("should return error for custom rejection reason (default to non-retryable)", async () => {
      const rejectResponse: MessagesSendRejectResponse = {
        email: "test@example.com",
        status: "rejected",
        _id: "message-id-123",
        reject_reason: "custom",
      };

      mockMailchimp.messages.send.mockResolvedValue([rejectResponse]);

      const result = await sendMail({ apiKey, message });

      expect(result).toEqual(err(rejectResponse));
    });
  });

  describe("edge cases", () => {
    it("should throw when no response from Mailchimp", async () => {
      mockMailchimp.messages.send.mockResolvedValue([]);

      await expect(sendMail({ apiKey, message })).rejects.toThrow(
        "No response from Mailchimp",
      );
    });

    it("should rethrow non-AxiosError exceptions", async () => {
      const customError = new Error("Custom error");
      mockMailchimp.messages.send.mockRejectedValue(customError);

      await expect(sendMail({ apiKey, message })).rejects.toThrow(customError);
    });
  });
});
