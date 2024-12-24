import { SubscriptionGroup, Workspace } from "@prisma/client";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { computePropertiesIncremental } from "../dist/src/segments/computePropertiesWorkflow/activities/computeProperties";
import { submitBatch } from "./apps/batch";
import { sendMessage } from "./messaging";
import { getOrCreateEmailProviders } from "./messaging/email";
import prisma from "./prisma";
import {
  getSubscriptionGroupDetails,
  getSubscriptionGroupWithAssignment,
  upsertSubscriptionGroup,
} from "./subscriptionGroups";
import {
  ChannelType,
  EmailProviderType,
  EventType,
  InternalEventType,
  SubscriptionGroupType,
  UserPropertyDefinitionType,
} from "./types";
import {
  findAllUserPropertyAssignments,
  upsertUserProperty,
} from "./userProperties";

describe("subscriptionManagementEndToEnd", () => {
  describe("when a user unsubscribes from an opt-out subscription group", () => {
    let workspace: Workspace;
    let subscriptionGroup: SubscriptionGroup;
    let userId: string;

    beforeEach(async () => {
      userId = randomUUID();
      workspace = await prisma().workspace.create({
        data: {
          name: `test-${randomUUID()}`,
        },
      });

      const emailProviders = await getOrCreateEmailProviders({
        workspaceId: workspace.id,
      });
      const testEmailProvider = emailProviders.find(
        (provider) => provider.type === EmailProviderType.Test,
      );
      if (!testEmailProvider) {
        throw new Error("No test email provider found");
      }
      await prisma().defaultEmailProvider.upsert({
        where: {
          workspaceId: workspace.id,
        },
        create: {
          workspaceId: workspace.id,
          emailProviderId: testEmailProvider.id,
        },
        update: {},
      });

      const emailUserProperty = unwrap(
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
      const subscriptionGroupWithAssignment =
        await getSubscriptionGroupWithAssignment({
          userId,
          subscriptionGroupId: subscriptionGroup.id,
        });

      const subscriptionDetails = getSubscriptionGroupDetails(
        subscriptionGroupWithAssignment,
      );
      expect(subscriptionDetails.action).toBe(null);

      const userPropertyAssignments = await findAllUserPropertyAssignments({
        userId,
        workspaceId: workspace.id,
      });
      expect(userPropertyAssignments.email).toBe("max@example.com");

      let sendMessageResult = await sendMessage({
        workspaceId: workspace.id,
        channel: ChannelType.Email,
        userId,
        templateId: "test-template",
        userPropertyAssignments,
        useDraft: false,
      });
      expect(unwrap(sendMessageResult).type).toEqual(
        InternalEventType.MessageSent,
      );
    });
  });
});
