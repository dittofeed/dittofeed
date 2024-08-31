import {
  MessageTemplate,
  SubscriptionGroup,
  Workspace,
  WorkspaceType,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { sendEmail, sendSms } from "./messaging";
import { upsertEmailProvider } from "./messaging/email";
import { upsertSmsProvider } from "./messaging/sms";
import prisma from "./prisma";
import { upsertSubscriptionSecret } from "./subscriptionGroups";
import {
  ChannelType,
  EmailProviderType,
  EmailTemplateResource,
  InternalEventType,
  MessageTags,
  SmsProviderType,
  SmsTemplateResource,
  SubscriptionGroupType,
} from "./types";

async function setupEmailTemplate(workspace: Workspace) {
  const [template, subscriptionGroup] = await Promise.all([
    prisma().messageTemplate.create({
      data: {
        workspaceId: workspace.id,
        name: `template-${randomUUID()}`,
        definition: {
          type: ChannelType.Email,
          from: "support@company.com",
          subject: "Hello",
          body: "{% unsubscribe_link here %}.",
        } satisfies EmailTemplateResource,
      },
    }),
    prisma().subscriptionGroup.create({
      data: {
        workspaceId: workspace.id,
        name: `group-${randomUUID()}`,
        type: "OptOut",
        channel: ChannelType.Email,
      },
    }),
    upsertEmailProvider({
      workspaceId: workspace.id,
      type: EmailProviderType.Test,
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
    workspace = await prisma().workspace.create({
      data: {
        name: `workspace-${randomUUID()}`,
      },
    });
  });
  describe("sendEmail", () => {
    describe("when sent from a child workspace", () => {
      let childWorkspace: Workspace;
      let parentWorkspace: Workspace;
      let template: MessageTemplate;
      let subscriptionGroup: SubscriptionGroup;

      beforeEach(async () => {
        [parentWorkspace, childWorkspace] = await Promise.all([
          prisma().workspace.create({
            data: {
              name: `parent-workspace-${randomUUID()}`,
              type: WorkspaceType.Parent,
            },
          }),
          prisma().workspace.create({
            data: {
              name: `child-workspace-${randomUUID()}`,
              type: WorkspaceType.Child,
            },
          }),
        ]);
        await prisma().workspaceRelation.create({
          data: {
            parentWorkspaceId: parentWorkspace.id,
            childWorkspaceId: childWorkspace.id,
          },
        });
        [template, subscriptionGroup] = await Promise.all([
          prisma().messageTemplate.create({
            data: {
              workspaceId: childWorkspace.id,
              name: `template-${randomUUID()}`,
              definition: {
                type: ChannelType.Email,
                from: "support@company.com",
                subject: "Hello",
                body: "{% unsubscribe_link here %}.",
              } satisfies EmailTemplateResource,
            },
          }),
          prisma().subscriptionGroup.create({
            data: {
              workspaceId: childWorkspace.id,
              name: `group-${randomUUID()}`,
              type: "OptOut",
              channel: ChannelType.Email,
            },
          }),
          upsertSubscriptionSecret({
            workspaceId: childWorkspace.id,
          }),
          upsertEmailProvider({
            workspaceId: parentWorkspace.id,
            type: EmailProviderType.Test,
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
        [parentWorkspace, childWorkspace] = await Promise.all([
          prisma().workspace.create({
            data: {
              name: `parent-workspace-${randomUUID()}`,
              type: WorkspaceType.Parent,
            },
          }),
          prisma().workspace.create({
            data: {
              name: `child-workspace-${randomUUID()}`,
              type: WorkspaceType.Child,
            },
          }),
        ]);
        await prisma().workspaceRelation.create({
          data: {
            parentWorkspaceId: parentWorkspace.id,
            childWorkspaceId: childWorkspace.id,
          },
        });
        [template, subscriptionGroup] = await Promise.all([
          prisma().messageTemplate.create({
            data: {
              workspaceId: childWorkspace.id,
              name: `template-${randomUUID()}`,
              definition: {
                type: ChannelType.Sms,
                body: "Test SMS body",
              } satisfies SmsTemplateResource,
            },
          }),
          prisma().subscriptionGroup.create({
            data: {
              workspaceId: childWorkspace.id,
              name: `group-${randomUUID()}`,
              type: "OptOut",
              channel: ChannelType.Sms,
            },
          }),
          upsertSubscriptionSecret({
            workspaceId: childWorkspace.id,
          }),
          upsertSmsProvider({
            workspaceId: parentWorkspace.id,
            type: SmsProviderType.Test,
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
});
