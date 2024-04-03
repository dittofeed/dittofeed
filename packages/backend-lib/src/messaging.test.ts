import { MessageTemplate, SubscriptionGroup, Workspace } from "@prisma/client";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { sendEmail } from "./messaging";
import { upsertEmailProvider } from "./messaging/email";
import prisma from "./prisma";
import { upsertSubscriptionSecret } from "./subscriptionGroups";
import {
  ChannelType,
  EmailProviderType,
  EmailTemplateResource,
  InternalEventType,
  MessageTags,
  SubscriptionGroupType,
} from "./types";

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
    describe("when an email includes an unsusbcribe link tag", () => {
      let template: MessageTemplate;
      let subscriptionGroup: SubscriptionGroup;
      beforeEach(async () => {
        await upsertEmailProvider({
          workspaceId: workspace.id,
          type: EmailProviderType.Test,
        });
        await upsertSubscriptionSecret({
          workspaceId: workspace.id,
        });
        template = await prisma().messageTemplate.create({
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
        });
        subscriptionGroup = await prisma().subscriptionGroup.create({
          data: {
            workspaceId: workspace.id,
            name: `group-${randomUUID()}`,
            type: "OptOut",
            channel: ChannelType.Email,
          },
        });
      });
      it("should render the tag", async () => {
        const userId = "user-id-1";
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
          userId,
          useDraft: false,
          subscriptionGroupDetails: {
            id: subscriptionGroup.id,
            name: subscriptionGroup.name,
            type: SubscriptionGroupType.OptOut,
            action: null,
          },
          provider: EmailProviderType.Test,
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
});
