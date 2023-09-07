import { SubscriptionGroup } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  DEBUG_USER_ID1,
  SUBSCRIPTION_SECRET_NAME,
} from "isomorphic-lib/src/constants";

import bootstrap from "./bootstrap";
import prisma from "./prisma";
import { generateSubscriptionChangeUrl } from "./subscriptionGroups";
import { SubscriptionChange } from "./types";

describe("generateSubscriptionChangeUrl", () => {
  let userId: string;
  let email: string;
  let subscriptionGroup: SubscriptionGroup;
  let workspaceId: string;

  beforeEach(async () => {
    userId = DEBUG_USER_ID1;
    email = "max@email.com";
    workspaceId = randomUUID();

    await bootstrap({
      workspaceId,
      workspaceName: workspaceId,
    });

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
            name: `${workspaceId} - Email`,
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
    const url = await generateSubscriptionChangeUrl({
      workspaceId,
      userId,
      subscriptionSecret: (
        await prisma().secret.findUniqueOrThrow({
          where: {
            workspaceId_name: {
              workspaceId,
              name: SUBSCRIPTION_SECRET_NAME,
            },
          },
        })
      ).value,
      identifier: email,
      identifierKey: "email",
      changedSubscription: subscriptionGroup.id,
      subscriptionChange: SubscriptionChange.Unsubscribe,
    });
    const parsed = new URL(url);
    expect(url).toContain(
      "http://localhost:3000/dashboard/public/subscription-management"
    );
    expect(parsed.searchParams.get("w")).toEqual(workspaceId);
    expect(parsed.searchParams.get("i")).toEqual(email);
    expect(parsed.searchParams.get("ik")).toEqual("email");
    expect(parsed.searchParams.get("sub")).toEqual("0");
  });
});
