import { SubscriptionGroup, Workspace } from "@prisma/client";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { submitBatch } from "./apps/batch";
import prisma from "./prisma";
import { upsertSubscriptionGroup } from "./subscriptionGroups";
import {
  ChannelType,
  EventType,
  SubscriptionGroupType,
  TraitUserPropertyDefinition,
  UserPropertyDefinitionType,
} from "./types";
import { computePropertiesIncremental } from "../dist/src/segments/computePropertiesWorkflow/activities/computeProperties";

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
      const emailUserProperty = await prisma().userProperty.create({
        data: {
          workspaceId: workspace.id,
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          } satisfies TraitUserPropertyDefinition,
        },
      });
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

    it("should remove the user from the subscription group", async () => {});
  });
});
