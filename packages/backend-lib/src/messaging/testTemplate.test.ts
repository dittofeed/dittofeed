import axios from "axios";
import { randomUUID } from "crypto";
import { SecretNames } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  ChannelType,
  InternalEventType,
  JsonResultType,
  MessageTemplateTestRequest,
  MessageTemplateTestResponse,
  ParsedWebhookBody,
  WebhookTemplateResource,
} from "isomorphic-lib/src/types";

import { insert } from "../db";
import { secret as dbSecret, workspace as dbWorkspace } from "../db/schema";
import logger from "../logger";
import { testTemplate, upsertMessageTemplate } from "../messaging";
import { Workspace } from "../types";

jest.mock("axios");

const mockAxios = axios as jest.Mocked<typeof axios>;

describe("testTemplate", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    jest.clearAllMocks();

    workspace = unwrap(
      await insert({
        table: dbWorkspace,
        values: {
          id: randomUUID(),
          name: `workspace-${randomUUID()}`,
          updatedAt: new Date(),
          createdAt: new Date(),
        },
      }),
    );
  });

  it("should reproduce schema validation error with webhook response", async () => {
    // Mock webhook response with empty body that causes schema validation issues
    const mockResponse = {
      data: "", // Empty string body that might cause schema validation issues
      status: 201,
      statusText: "Created",
      headers: { "content-type": "application/json" },
      config: {},
    };

    mockAxios.request.mockResolvedValue(mockResponse);

    // Create webhook secret
    await insert({
      table: dbSecret,
      values: {
        id: randomUUID(),
        workspaceId: workspace.id,
        name: SecretNames.Webhook,
        configValue: {
          type: ChannelType.Webhook,
          ApiKey: "test-key",
        },
      },
    });

    // Create webhook template
    const template = unwrap(
      await upsertMessageTemplate({
        name: randomUUID(),
        workspaceId: workspace.id,
        definition: {
          type: ChannelType.Webhook,
          identifierKey: "id",
          body: JSON.stringify({
            config: {
              url: "https://example.com/webhook",
              method: "POST",
              responseType: "json",
              data: {
                message: "test message",
              },
            },
          } satisfies ParsedWebhookBody),
        } satisfies WebhookTemplateResource,
      }),
    );

    const testRequest: MessageTemplateTestRequest = {
      workspaceId: workspace.id,
      templateId: template.id,
      channel: ChannelType.Webhook,
      userProperties: { id: "test-user" },
    };

    const result = await testTemplate(testRequest);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Test that the response can be validated against the MessageTemplateTestResponse schema
      const response = {
        type: JsonResultType.Ok,
        value: result.value,
      };

      const validationResult = schemaValidateWithErr(
        response,
        MessageTemplateTestResponse,
      );
      if (validationResult.isErr()) {
        logger().error({ err: validationResult.error }, "Schema validation");
        throw new Error("Schema validation error");
      }

      // For now just verify the structure is as expected
      expect(result.value.type).toBe(InternalEventType.MessageSent);
    }
  });

  it("should handle webhook response with special characters", async () => {
    // Mock webhook response with special characters that might cause issues
    const mockResponse = {
      data: "#", // Special character that might trigger schema validation error
      status: 201,
      statusText: "Created",
      headers: { "content-type": "text/plain" },
      config: {},
    };

    mockAxios.request.mockResolvedValue(mockResponse);

    // Create webhook secret
    await insert({
      table: dbSecret,
      values: {
        id: randomUUID(),
        workspaceId: workspace.id,
        name: SecretNames.Webhook,
        configValue: {
          type: ChannelType.Webhook,
          ApiKey: "test-key",
        },
      },
    });

    // Create webhook template
    const template = unwrap(
      await upsertMessageTemplate({
        name: randomUUID(),
        workspaceId: workspace.id,
        definition: {
          type: ChannelType.Webhook,
          identifierKey: "id",
          body: JSON.stringify({
            config: {
              url: "https://example.com/webhook",
              method: "POST",
              responseType: "text",
              data: {
                message: "test message",
              },
            },
          } satisfies ParsedWebhookBody),
        } satisfies WebhookTemplateResource,
      }),
    );

    const testRequest: MessageTemplateTestRequest = {
      workspaceId: workspace.id,
      templateId: template.id,
      channel: ChannelType.Webhook,
      userProperties: { id: "test-user" },
    };

    const result = await testTemplate(testRequest);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Test schema validation
      const response = {
        type: JsonResultType.Ok,
        value: result.value,
      };

      const validationResult = schemaValidateWithErr(
        response,
        MessageTemplateTestResponse,
      );
      if (validationResult.isErr()) {
        logger().error({ err: validationResult.error }, "Schema validation");
        throw new Error("Schema validation error");
      }

      expect(result.value.type).toBe(InternalEventType.MessageSent);
    }
  });
});
