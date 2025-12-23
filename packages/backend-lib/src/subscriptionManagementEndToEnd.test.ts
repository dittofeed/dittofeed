import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import { EmailTemplateResource } from "isomorphic-lib/src/types";

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
          workspaceId: workspace.id,
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
        userUpdates: [
          {
            userId: userLookupResult.userId,
            changes: {
              [params.s]: params.sub === "1",
            },
          },
        ],
      });

      // looking up subscription details again
      subscriptionGroupWithAssignment =
        await getSubscriptionGroupWithAssignment({
          workspaceId: workspace.id,
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

  describe("when a user sends to a third party and they click unsubscribe", () => {
    let workspace: Workspace;
    let subscriptionGroup: SubscriptionGroup;
    let userId: string;
    let templateId: string;
    let emailUserProperty: SavedUserPropertyResource;
    let managerEmailUserProperty: SavedUserPropertyResource;

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

      // Create email user property
      emailUserProperty = unwrap(
        await upsertUserProperty({
          workspaceId: workspace.id,
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        }),
      );

      // Create managerEmail user property (must be created before template that references it)
      managerEmailUserProperty = unwrap(
        await upsertUserProperty({
          workspaceId: workspace.id,
          name: "managerEmail",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "managerEmail",
          },
        }),
      );

      // Create template with custom identifierKey to send to manager
      // Note: User properties must exist before creating template with identifierKey
      const template = unwrap(
        await upsertMessageTemplate({
          workspaceId: workspace.id,
          name: "notify-manager-template",
          definition: {
            type: ChannelType.Email,
            from: "support@company.com",
            subject: "User Activity",
            body: "{% unsubscribe_link here %}.",
            identifierKey: "managerEmail",
          } satisfies EmailTemplateResource,
        }),
      );
      templateId = template.id;

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

      // Submit user identify event with both email and managerEmail
      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [
            {
              type: EventType.Identify,
              userId,
              messageId: randomUUID(),
              traits: {
                email: "user@example.com",
                managerEmail: "manager@company.com",
              },
            },
          ],
        },
      });

      await computePropertiesIncremental({
        workspaceId: workspace.id,
        segments: [],
        userProperties: [emailUserProperty, managerEmailUserProperty],
        journeys: [],
        integrations: [],
        now: Date.now(),
      });
    });

    it("should correctly unsubscribe the original user when manager clicks unsubscribe link", async () => {
      // 1. Verify user properties are set correctly
      const userPropertyAssignments = await findAllUserPropertyAssignments({
        userId,
        workspaceId: workspace.id,
      });
      expect(userPropertyAssignments.email).toBe("user@example.com");
      expect(userPropertyAssignments.managerEmail).toBe("manager@company.com");

      // 2. Get subscription group details
      let subscriptionGroupWithAssignment =
        await getSubscriptionGroupWithAssignment({
          workspaceId: workspace.id,
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

      // 3. Send message to manager
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

      // Verify email was sent to manager, not user
      expect(sent.variant.to).toBe("manager@company.com");

      // 4. Extract unsubscribe URL
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

      // 5. Verify URL has correct identifierKey
      expect(params.ik).toEqual("managerEmail");
      expect(params.i).toEqual("manager@company.com");
      expect(params.sub).toEqual("0");
      if (!params.s) {
        throw new Error("Subscription ID not found");
      }

      // 6. Lookup user via the unsubscribe params - should find original user
      const userLookupResult = unwrap(
        await lookupUserForSubscriptions({
          workspaceId: params.w,
          identifier: params.i,
          identifierKey: params.ik,
          hash: params.h,
        }),
      );
      expect(userLookupResult.userId).toEqual(userId);

      // 7. Update subscription
      await updateUserSubscriptions({
        workspaceId: params.w,
        userUpdates: [
          {
            userId: userLookupResult.userId,
            changes: {
              [params.s]: params.sub === "1",
            },
          },
        ],
      });

      // 8. Verify subscription state changed
      subscriptionGroupWithAssignment =
        await getSubscriptionGroupWithAssignment({
          workspaceId: workspace.id,
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

      // 9. Verify subsequent messages to this user are skipped
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
