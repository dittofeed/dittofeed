import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { submitBatch } from "./apps/batch";
import { WELCOME_TEMPLATE } from "./bootstrap/messageTemplates";
import { computePropertiesIncremental } from "./computedProperties/computePropertiesWorkflow/activities";
import { db } from "./db";
import { defaultEmailProvider as dbDefaultEmailProvider } from "./db/schema";
import { sendMessage, upsertMessageTemplate } from "./messaging";
import { getOrCreateEmailProviders } from "./messaging/email";
import {
  getSubscriptionGroupDetails,
  getSubscriptionGroupWithAssignment,
  lookupUserForSubscriptions,
  updateUserSubscriptions,
  upsertSubscriptionGroup,
  upsertSubscriptionSecret,
} from "./subscriptionGroups";
import {
  ChannelType,
  EmailProviderType,
  EventType,
  InternalEventType,
  SavedUserPropertyResource,
  SubscriptionChange,
  SubscriptionGroup,
  SubscriptionGroupType,
  SubscriptionParams,
  UserPropertyDefinitionType,
  Workspace,
} from "./types";
import {
  findAllUserPropertyAssignments,
  upsertUserProperty,
} from "./userProperties";
import { createWorkspace } from "./workspaces";

describe("subscriptionManagementEndToEnd", () => {
  describe("when a user unsubscribes from an opt-out subscription group", () => {
    let workspace: Workspace;
    let subscriptionGroup: SubscriptionGroup;
    let userId: string;
    let templateId: string;

    beforeEach(async () => {
      userId = randomUUID();
      workspace = unwrap(
        await createWorkspace({
          id: randomUUID(),
          name: `test-${randomUUID()}`,
          updatedAt: new Date(),
        }),
      );

      const emailProviders = await getOrCreateEmailProviders({
        workspaceId: workspace.id,
      });
      const template = unwrap(
        await upsertMessageTemplate({
          workspaceId: workspace.id,
          name: "test-template",
          definition: WELCOME_TEMPLATE,
        }),
      );
      templateId = template.id;
      const testEmailProvider = emailProviders.find(
        (provider) => provider.type === EmailProviderType.Test,
      );
      if (!testEmailProvider) {
        throw new Error("No test email provider found");
      }
      await db()
        .insert(dbDefaultEmailProvider)
        .values({
          workspaceId: workspace.id,
          emailProviderId: testEmailProvider.id,
          updatedAt: new Date(),
        })
        .onConflictDoNothing();

      const emailUserProperty: SavedUserPropertyResource = unwrap(
        await upsertUserProperty({
          workspaceId: workspace.id,
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        }),
      );
      subscriptionGroup = unwrap(
        await upsertSubscriptionGroup({
          workspaceId: workspace.id,
          id: randomUUID(),
          name: "test-group",
          type: SubscriptionGroupType.OptOut,
          channel: ChannelType.Email,
        }),
      );
      await upsertSubscriptionSecret({
        workspaceId: workspace.id,
      });
      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [
            {
              type: EventType.Identify,
              userId,
              messageId: randomUUID(),
              traits: {
                email: "max@example.com",
              },
            },
          ],
        },
      });
      await computePropertiesIncremental({
        workspaceId: workspace.id,
        segments: [],
        userProperties: [emailUserProperty],
        journeys: [],
        integrations: [],
        now: Date.now(),
      });
    });

    it("should remove the user from the subscription group", async () => {
      let subscriptionGroupWithAssignment =
        await getSubscriptionGroupWithAssignment({
          userId,
          subscriptionGroupId: subscriptionGroup.id,
        });
      if (!subscriptionGroupWithAssignment) {
        throw new Error("Subscription group with assignment not found");
      }

      let subscriptionGroupDetails = getSubscriptionGroupDetails(
        subscriptionGroupWithAssignment,
      );
      expect(subscriptionGroupDetails.action).toBe(null);

      const userPropertyAssignments = await findAllUserPropertyAssignments({
        userId,
        workspaceId: workspace.id,
      });
      expect(userPropertyAssignments.email).toBe("max@example.com");

      let sendMessageResult = await sendMessage({
        workspaceId: workspace.id,
        channel: ChannelType.Email,
        userId,
        subscriptionGroupDetails: {
          name: subscriptionGroup.name,
          ...subscriptionGroupDetails,
        },
        templateId,
        userPropertyAssignments,
        useDraft: false,
      });
      const sent = unwrap(sendMessageResult);
      if (sent.type !== InternalEventType.MessageSent) {
        throw new Error("Message not sent");
      }
      if (sent.variant.type !== ChannelType.Email) {
        throw new Error("Email not sent");
      }
      const unsubscribeUrl = sent.variant.body.match(
        /<a[^>]*class="df-unsubscribe"[^>]*href="([^"]*)"[^>]*>/,
      )?.[1];
      if (!unsubscribeUrl) {
        throw new Error(`Unsubscribe URL not found in: ${sent.variant.body}`);
      }
      const url = new URL(unsubscribeUrl);
      const params = unwrap(
        schemaValidateWithErr(
          Object.fromEntries(url.searchParams),
          SubscriptionParams,
        ),
      );
      expect(params.sub).toEqual("0");
      if (!params.s) {
        throw new Error("Subscription ID not found");
      }

      const userLookupResult = unwrap(
        await lookupUserForSubscriptions({
          workspaceId: params.w,
          identifier: params.i,
          identifierKey: params.ik,
          hash: params.h,
        }),
      );
      expect(userLookupResult.userId).toEqual(userId);

      await updateUserSubscriptions({
        workspaceId: params.w,
        userId: userLookupResult.userId,
        changes: {
          [params.s]: params.sub === "1",
        },
      });

      // looking up subscription details again
      subscriptionGroupWithAssignment =
        await getSubscriptionGroupWithAssignment({
          userId,
          subscriptionGroupId: subscriptionGroup.id,
        });
      if (!subscriptionGroupWithAssignment) {
        throw new Error("Subscription group with assignment not found");
      }

      subscriptionGroupDetails = getSubscriptionGroupDetails(
        subscriptionGroupWithAssignment,
      );
      expect(
        subscriptionGroupDetails.action,
        "User should be explicitly unsubscribed",
      ).toBe(SubscriptionChange.Unsubscribe);

      sendMessageResult = await sendMessage({
        workspaceId: workspace.id,
        channel: ChannelType.Email,
        userId,
        subscriptionGroupDetails: {
          name: subscriptionGroup.name,
          ...subscriptionGroupDetails,
        },
        templateId,
        userPropertyAssignments,
        useDraft: false,
      });
      if (sendMessageResult.isOk()) {
        throw new Error("Message sent when it should be skipped");
      }
      expect(
        sendMessageResult.error.type,
        "After unsubscribing message should be skipped",
      ).toEqual(InternalEventType.MessageSkipped);
    });
  });
});
