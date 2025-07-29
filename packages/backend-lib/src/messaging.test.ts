import axios from "axios";
import { randomUUID } from "crypto";
import { SecretNames } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  AppFileType,
  BadWorkspaceConfigurationType,
  Base64EncodedFile,
  ParsedWebhookBody,
  WebhookTemplateResource,
  WorkspaceTypeAppEnum,
} from "isomorphic-lib/src/types";

import { insert } from "./db";
import {
  messageTemplate as dbMessageTemplate,
  secret as dbSecret,
  subscriptionGroup as dbSubscriptionGroup,
  workspace as dbWorkspace,
} from "./db/schema";
import {
  sendEmail,
  sendSms,
  sendWebhook,
  upsertMessageTemplate,
} from "./messaging";
import { upsertEmailProvider } from "./messaging/email";
import { upsertSmsProvider } from "./messaging/sms";
import { upsertSubscriptionSecret } from "./subscriptionGroups";
import {
  ChannelType,
  EmailProviderType,
  EmailTemplateResource,
  InternalEventType,
  MessageTags,
  MessageTemplate,
  SmsProviderType,
  SmsTemplateResource,
  SubscriptionGroup,
  SubscriptionGroupType,
  UpsertMessageTemplateValidationErrorType,
  Workspace,
} from "./types";

jest.mock("axios");

const mockAxios = axios as jest.Mocked<typeof axios>;

async function setupEmailTemplate(workspace: Workspace) {
  const templatePromise = insert({
    table: dbMessageTemplate,
    values: {
      id: randomUUID(),
      workspaceId: workspace.id,
      name: `template-${randomUUID()}`,
      definition: {
        type: ChannelType.Email,
        from: "support@company.com",
        subject: "Hello",
        body: "{% unsubscribe_link here %}.",
      } satisfies EmailTemplateResource,
      updatedAt: new Date(),
      createdAt: new Date(),
    },
  }).then(unwrap);
  const subscriptionGroupPromise = insert({
    table: dbSubscriptionGroup,
    values: {
      id: randomUUID(),
      workspaceId: workspace.id,
      name: `group-${randomUUID()}`,
      type: "OptOut",
      channel: ChannelType.Email,
      updatedAt: new Date(),
      createdAt: new Date(),
    },
  }).then(unwrap);

  const [template, subscriptionGroup] = await Promise.all([
    templatePromise,
    subscriptionGroupPromise,
    upsertEmailProvider({
      workspaceId: workspace.id,
      config: { type: EmailProviderType.Test },
    }),
    upsertSubscriptionSecret({
      workspaceId: workspace.id,
    }),
  ]);
  return { template, subscriptionGroup };
}

describe("messaging", () => {
  let workspace: Workspace;

  beforeEach(async () => {
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

  describe("sendEmail", () => {
    describe("when sent from a child workspace", () => {
      let childWorkspace: Workspace;
      let parentWorkspace: Workspace;
      let template: MessageTemplate;
      let subscriptionGroup: SubscriptionGroup;

      beforeEach(async () => {
        const parentWorkspaceId = randomUUID();
        [parentWorkspace, childWorkspace] = await Promise.all([
          insert({
            table: dbWorkspace,
            values: {
              id: parentWorkspaceId,
              name: `parent-workspace-${randomUUID()}`,
              type: WorkspaceTypeAppEnum.Parent,
              updatedAt: new Date(),
              createdAt: new Date(),
            },
          }).then(unwrap),
          insert({
            table: dbWorkspace,
            values: {
              id: randomUUID(),
              parentWorkspaceId,
              name: `child-workspace-${randomUUID()}`,
              type: WorkspaceTypeAppEnum.Child,
              updatedAt: new Date(),
              createdAt: new Date(),
            },
          }).then(unwrap),
        ]);
        [template, subscriptionGroup] = await Promise.all([
          insert({
            table: dbMessageTemplate,
            values: {
              id: randomUUID(),
              workspaceId: childWorkspace.id,
              name: `template-${randomUUID()}`,
              updatedAt: new Date(),
              createdAt: new Date(),
              definition: {
                type: ChannelType.Email,
                from: "support@company.com",
                subject: "Hello",
                body: "{% unsubscribe_link here %}.",
              } satisfies EmailTemplateResource,
            },
          }).then(unwrap),
          insert({
            table: dbSubscriptionGroup,
            values: {
              id: randomUUID(),
              workspaceId: childWorkspace.id,
              name: `group-${randomUUID()}`,
              type: "OptOut",
              channel: ChannelType.Email,
              updatedAt: new Date(),
              createdAt: new Date(),
            },
          }).then(unwrap),
          upsertSubscriptionSecret({
            workspaceId: childWorkspace.id,
          }),
          upsertEmailProvider({
            workspaceId: parentWorkspace.id,
            config: { type: EmailProviderType.Test },
          }),
        ]);
      });

      it("should use the parent workspace's email provider", async () => {
        const userId = 1234;
        const email = "test@email.com";

        const payload = await sendEmail({
          workspaceId: childWorkspace.id,
          templateId: template.id,
          messageTags: {
            workspaceId: childWorkspace.id,
            templateId: template.id,
            runId: "run-id-1",
            nodeId: "node-id-1",
            messageId: "message-id-1",
          } satisfies MessageTags,
          userPropertyAssignments: {
            id: userId,
            email,
          },
          userId: String(userId),
          useDraft: false,
          subscriptionGroupDetails: {
            id: subscriptionGroup.id,
            name: subscriptionGroup.name,
            type: SubscriptionGroupType.OptOut,
            action: null,
          },
          providerOverride: EmailProviderType.Test,
        });
        const unwrapped = unwrap(payload);
        expect(unwrapped.type).toBe(InternalEventType.MessageSent);
      });
    });

    describe("when an email to a user with a numeric id includes an unsusbcribe link tag", () => {
      let template: MessageTemplate;
      let subscriptionGroup: SubscriptionGroup;
      beforeEach(async () => {
        ({ template, subscriptionGroup } = await setupEmailTemplate(workspace));
      });
      it("should render the tag", async () => {
        const userId = 1234;
        const email = "test@email.com";

        const payload = await sendEmail({
          workspaceId: workspace.id,
          templateId: template.id,
          messageTags: {
            workspaceId: workspace.id,
            templateId: template.id,
            runId: "run-id-1",
            nodeId: "node-id-1",
            messageId: "message-id-1",
          } satisfies MessageTags,
          userPropertyAssignments: {
            id: userId,
            email,
          },
          userId: String(userId),
          useDraft: false,
          subscriptionGroupDetails: {
            id: subscriptionGroup.id,
            name: subscriptionGroup.name,
            type: SubscriptionGroupType.OptOut,
            action: null,
          },
          providerOverride: EmailProviderType.Test,
        });
        const unwrapped = unwrap(payload);
        if (unwrapped.type === InternalEventType.MessageSkipped) {
          throw new Error("Message should not be skipped");
        }
        expect(unwrapped.type).toBe(InternalEventType.MessageSent);
        expect(unwrapped.variant.to).toBe(email);

        if (unwrapped.variant.type !== ChannelType.Email) {
          throw new Error("Message should be of type Email");
        }
        expect(unwrapped.variant.subject).toBe("Hello");
        expect(unwrapped.variant.from).toBe("support@company.com");
        expect(unwrapped.variant.body).toMatch(/href="([^"]+)"/);
      });
    });
  });

  describe("sendSms", () => {
    describe("when sent from a child workspace", () => {
      let childWorkspace: Workspace;
      let parentWorkspace: Workspace;
      let template: MessageTemplate;
      let subscriptionGroup: SubscriptionGroup;

      beforeEach(async () => {
        const parentWorkspaceId = randomUUID();
        [parentWorkspace, childWorkspace] = await Promise.all([
          insert({
            table: dbWorkspace,
            values: {
              id: parentWorkspaceId,
              name: `parent-workspace-${randomUUID()}`,
              type: WorkspaceTypeAppEnum.Parent,
              updatedAt: new Date(),
              createdAt: new Date(),
            },
          }).then(unwrap),
          insert({
            table: dbWorkspace,
            values: {
              id: randomUUID(),
              parentWorkspaceId,
              name: `child-workspace-${randomUUID()}`,
              type: WorkspaceTypeAppEnum.Child,
              updatedAt: new Date(),
              createdAt: new Date(),
            },
          }).then(unwrap),
        ]);
        [template, subscriptionGroup] = await Promise.all([
          insert({
            table: dbMessageTemplate,
            values: {
              id: randomUUID(),
              workspaceId: childWorkspace.id,
              name: `template-${randomUUID()}`,
              updatedAt: new Date(),
              createdAt: new Date(),
              definition: {
                type: ChannelType.Sms,
                body: "Test SMS body",
              } satisfies SmsTemplateResource,
            },
          }).then(unwrap),
          insert({
            table: dbSubscriptionGroup,
            values: {
              id: randomUUID(),
              workspaceId: childWorkspace.id,
              name: `group-${randomUUID()}`,
              type: "OptOut",
              channel: ChannelType.Sms,
              updatedAt: new Date(),
              createdAt: new Date(),
            },
          }).then(unwrap),
          upsertSubscriptionSecret({
            workspaceId: childWorkspace.id,
          }),
          upsertSmsProvider({
            workspaceId: parentWorkspace.id,
            config: { type: SmsProviderType.Test },
          }),
        ]);
      });

      it("should use the parent workspace's SMS provider", async () => {
        const userId = "1234";
        const phone = "+1234567890";

        const payload = await sendSms({
          workspaceId: childWorkspace.id,
          templateId: template.id,
          messageTags: {
            workspaceId: childWorkspace.id,
            templateId: template.id,
            runId: "run-id-1",
            nodeId: "node-id-1",
            messageId: "message-id-1",
          } satisfies MessageTags,
          userPropertyAssignments: {
            id: userId,
            phone,
          },
          userId,
          useDraft: false,
          subscriptionGroupDetails: {
            id: subscriptionGroup.id,
            name: subscriptionGroup.name,
            type: SubscriptionGroupType.OptOut,
            action: null,
          },
          providerOverride: SmsProviderType.Test,
        });
        const unwrapped = unwrap(payload);
        expect(unwrapped.type).toBe(InternalEventType.MessageSent);
      });
    });
  });

  describe("sendWebhook", () => {
    describe("when your webhook includes screts", () => {
      let templateId: string;
      beforeEach(async () => {
        const mockResponse = {
          data: { message: "Data from base axios call" },
          status: 200,
          statusText: "OK",
          headers: {},
          config: {},
        };

        mockAxios.request.mockResolvedValue(mockResponse);

        unwrap(
          await insert({
            table: dbSecret,
            values: {
              id: randomUUID(),
              workspaceId: workspace.id,
              name: SecretNames.Webhook,
              configValue: {
                type: ChannelType.Webhook,
                ApiKey: "1234",
              },
            },
          }),
        );
      });

      describe("when the template is successfully sent", () => {
        beforeEach(async () => {
          const template = unwrap(
            await upsertMessageTemplate({
              name: randomUUID(),
              workspaceId: workspace.id,
              definition: {
                type: ChannelType.Webhook,
                identifierKey: "id",
                body: JSON.stringify({
                  config: {
                    url: "https://dittofeed-test.com",
                    method: "POST",
                    responseType: "json",
                    data: {
                      message: "{{ user.firstName }}",
                    },
                  },
                  secret: {
                    headers: {
                      Authorization: "{{ secrets.ApiKey }}",
                    },
                  },
                } satisfies ParsedWebhookBody),
              } satisfies WebhookTemplateResource,
            }),
          );
          templateId = template.id;
        });
        it("the returned message sent event should replace secrets with placeholder text", async () => {
          const userId = randomUUID();
          const result = await sendWebhook({
            workspaceId: workspace.id,
            templateId,
            userPropertyAssignments: {
              id: randomUUID(),
              firstName: "John",
            },
            messageTags: {
              workspaceId: workspace.id,
              templateId,
              runId: randomUUID(),
              nodeId: randomUUID(),
              messageId: randomUUID(),
              userId,
            } satisfies MessageTags,
            useDraft: false,
            userId,
          });
          if (result.isErr()) {
            throw new Error(JSON.stringify(result.error));
          }
          const { value } = result;
          if (value.type !== InternalEventType.MessageSent) {
            throw new Error(`Expected message sent event, got ${value.type}`);
          }
          if (value.variant.type !== ChannelType.Webhook) {
            throw new Error(
              `Expected webhook event, got ${value.variant.type}`,
            );
          }
          expect(value.variant.request.headers?.Authorization).toBeUndefined();
        });
        describe("with a rendering error", () => {
          beforeEach(async () => {
            const template = unwrap(
              await upsertMessageTemplate({
                name: randomUUID(),
                workspaceId: workspace.id,
                definition: {
                  type: ChannelType.Webhook,
                  identifierKey: "id",
                  body: JSON.stringify({
                    myInvalidKey: "{{ secrets.ApiKey }}",
                  }),
                } satisfies WebhookTemplateResource,
              }),
            );
            templateId = template.id;
          });
          it("should not expose secret in event", async () => {
            const userId = randomUUID();
            const result = await sendWebhook({
              workspaceId: workspace.id,
              templateId,
              userPropertyAssignments: {
                id: randomUUID(),
              },
              messageTags: {
                workspaceId: workspace.id,
                templateId,
                runId: randomUUID(),
                nodeId: randomUUID(),
                messageId: randomUUID(),
                userId,
              } satisfies MessageTags,
              useDraft: false,
              userId,
            });
            if (result.isOk()) {
              throw new Error("Expected error, got ok");
            }
            const { error } = result;
            if (error.type !== InternalEventType.BadWorkspaceConfiguration) {
              throw new Error(
                `Expected message template render error event, got ${error.type}`,
              );
            }
            if (
              error.variant.type !==
              BadWorkspaceConfigurationType.MessageTemplateRenderError
            ) {
              throw new Error(
                `Expected message template render error event, got ${error.variant.type}`,
              );
            }
            expect(error.variant.error).not.toContain("1234");
          });
        });
      });
    });
  });

  describe("upsertMessageTemplate", () => {
    describe("when a message template is created in a second workspace with a re-used id", () => {
      let secondWorkspace: Workspace;
      beforeEach(async () => {
        secondWorkspace = await insert({
          table: dbWorkspace,
          values: {
            id: randomUUID(),
            name: randomUUID(),
            updatedAt: new Date(),
            createdAt: new Date(),
          },
        }).then(unwrap);
      });
      it("returns a unique constraint violation error", async () => {
        const id = randomUUID();
        const result = await upsertMessageTemplate({
          id,
          name: randomUUID(),
          workspaceId: workspace.id,
          definition: {
            type: ChannelType.Email,
            from: "support@company.com",
            subject: "Hello",
            body: "{% unsubscribe_link here %}.",
          } satisfies EmailTemplateResource,
        });
        expect(result.isOk()).toBe(true);
        const secondResult = await upsertMessageTemplate({
          id,
          name: randomUUID(),
          workspaceId: secondWorkspace.id,
          definition: {
            type: ChannelType.Email,
            from: "support@company.com",
            subject: "Hello",
            body: "{% unsubscribe_link here %}.",
          } satisfies EmailTemplateResource,
        });
        const errorType = secondResult.isErr() && secondResult.error.type;
        expect(
          errorType,
          "second upsert should fail with unique constraint violation",
        ).toEqual(
          UpsertMessageTemplateValidationErrorType.UniqueConstraintViolation,
        );
      });
    });
  });

  describe("when sending email with base64 encoded attachments", () => {
    let template: MessageTemplate;

    beforeEach(async () => {
      // First create the email provider
      await upsertEmailProvider({
        workspaceId: workspace.id,
        config: { type: EmailProviderType.Test },
        setDefault: true,
      });

      // Then create the template
      template = await insert({
        table: dbMessageTemplate,
        values: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: `template-${randomUUID()}`,
          updatedAt: new Date(),
          createdAt: new Date(),
          definition: {
            type: ChannelType.Email,
            from: "support@company.com",
            subject: "Hello with attachment",
            body: "<mjml><mj-body><mj-section><mj-column><mj-text>Please find the attached file.</mj-text></mj-column></mj-section></mj-body></mjml>",
            attachmentUserProperties: ["myFile"],
          } satisfies EmailTemplateResource,
        },
      }).then(unwrap);
    });

    it("should handle base64 encoded file attachments", async () => {
      const userId = 1234;
      const email = "test@email.com";

      // Sample base64 encoded file (a simple text file)
      const base64FileData = "SGVsbG8gV29ybGQ="; // "Hello World" in base64
      const attachmentFile: Base64EncodedFile = {
        type: AppFileType.Base64Encoded,
        name: "test.txt",
        mimeType: "text/plain",
        data: base64FileData,
      };

      const result = await sendEmail({
        workspaceId: workspace.id,
        templateId: template.id,
        messageTags: {
          workspaceId: workspace.id,
          templateId: template.id,
          runId: "run-id-1",
          messageId: randomUUID(),
        },
        userPropertyAssignments: {
          email,
          myFile: attachmentFile,
        },
        userId: userId.toString(),
        useDraft: false,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.type).toBe(InternalEventType.MessageSent);
        if (result.value.type === InternalEventType.MessageSent) {
          expect(result.value.variant.type).toBe(ChannelType.Email);
          if (result.value.variant.type === ChannelType.Email) {
            expect(result.value.variant.attachments).toHaveLength(1);
            expect(result.value.variant.attachments?.[0]).toEqual({
              name: "test.txt",
              mimeType: "text/plain",
            });
          }
        }
      }
    });
  });
});
