import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { WorkspaceTypeAppEnum } from "isomorphic-lib/src/types";

import { insert } from "./db";
import {
  messageTemplate as dbMessageTemplate,
  subscriptionGroup as dbSubscriptionGroup,
  workspace as dbWorkspace,
} from "./db/schema";
import { sendEmail, sendSms, upsertMessageTemplate } from "./messaging";
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
});
