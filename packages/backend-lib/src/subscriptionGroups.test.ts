import { SubscriptionGroup } from "@prisma/client";
import { randomUUID } from "crypto";
import { DEBUG_USER_ID1, SecretNames } from "isomorphic-lib/src/constants";

import bootstrap from "./bootstrap";
import prisma from "./prisma";
import { generateSubscriptionChangeUrl } from "./subscriptionGroups";
import { SubscriptionChange } from "./types";

describe("subscriptionGroups", () => {
  describe("generateSubscriptionChangeUrl", () => {
    let userId: string;
    let email: string;
    let subscriptionGroup: SubscriptionGroup;
    let workspaceId: string;
    let workspaceName: string;

    beforeEach(async () => {
      userId = DEBUG_USER_ID1;
      email = "max@email.com";
      workspaceName = randomUUID();

      const bootstrapResult = await bootstrap({
        workspaceName,
      });
      workspaceId = bootstrapResult.workspaceId;

      const results = await Promise.all([
        prisma().userProperty.findUniqueOrThrow({
          where: {
            workspaceId_name: {
              workspaceId,
              name: "email",
            },
          },
        }),
        prisma().subscriptionGroup.findUniqueOrThrow({
          where: {
            workspaceId_name: {
              workspaceId,
              name: `${workspaceName} - Email`,
            },
          },
        }),
      ]);
      const [up] = results;
      // eslint-disable-next-line prefer-destructuring
      subscriptionGroup = results[1];

      await prisma().userPropertyAssignment.upsert({
        where: {
          workspaceId_userPropertyId_userId: {
            workspaceId,
            userId,
            userPropertyId: up.id,
          },
        },
        create: {
          workspaceId,
          value: JSON.stringify(email),
          userPropertyId: up.id,
          userId,
        },
        update: {},
      });
    });
    it("should generate a valid URL", async () => {
      const secret = await prisma().secret.findUnique({
        where: {
          workspaceId_name: {
            workspaceId,
            name: SecretNames.Subscription,
          },
        },
      });
      if (!secret?.value) {
        throw new Error("No secret found");
      }
      const url = generateSubscriptionChangeUrl({
        workspaceId,
        userId,
        subscriptionSecret: secret.value,
        identifier: email,
        identifierKey: "email",
        changedSubscription: subscriptionGroup.id,
        subscriptionChange: SubscriptionChange.Unsubscribe,
      });
      const parsed = new URL(url);
      expect(url).toContain(
        "http://localhost:3000/dashboard/public/subscription-management",
      );
      expect(parsed.searchParams.get("w")).toEqual(workspaceId);
      expect(parsed.searchParams.get("i")).toEqual(email);
      expect(parsed.searchParams.get("ik")).toEqual("email");
      expect(parsed.searchParams.get("sub")).toEqual("0");
    });
  });
});
