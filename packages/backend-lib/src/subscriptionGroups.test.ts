import { SubscriptionGroup } from "@prisma/client";
import {
  DEBUG_USER_ID1,
  SUBSCRIPTION_SECRET_NAME,
} from "isomorphic-lib/src/constants";

import config from "./config";
import prisma from "./prisma";
import { generateSubscriptionChangeUrl } from "./subscriptionGroups";
import { SubscriptionChange } from "./types";

describe("generateSubscriptionChangeUrl", () => {
  let userId: string;
  let email: string;
  let subscriptionGroup: SubscriptionGroup;

  beforeEach(async () => {
    userId = DEBUG_USER_ID1;
    email = "max@email.com";

    const results = await Promise.all([
      prisma().userProperty.findUniqueOrThrow({
        where: {
          workspaceId_name: {
            workspaceId: config().defaultWorkspaceId,
            name: "email",
          },
        },
      }),
      prisma().subscriptionGroup.findUniqueOrThrow({
        where: {
          workspaceId_name: {
            workspaceId: config().defaultWorkspaceId,
            name: "Default - Email",
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
          workspaceId: config().defaultWorkspaceId,
          userId,
          userPropertyId: up.id,
        },
      },
      create: {
        workspaceId: config().defaultWorkspaceId,
        value: JSON.stringify(email),
        userPropertyId: up.id,
        userId,
      },
      update: {},
    });
  });
  it("should generate a valid URL", async () => {
    const url = await generateSubscriptionChangeUrl({
      workspaceId: config().defaultWorkspaceId,
      userId,
      subscriptionSecret: (
        await prisma().secret.findUniqueOrThrow({
          where: {
            workspaceId_name: {
              workspaceId: config().defaultWorkspaceId,
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
    expect(parsed.searchParams.get("w")).toEqual(config().defaultWorkspaceId);
    expect(parsed.searchParams.get("i")).toEqual(email);
    expect(parsed.searchParams.get("ik")).toEqual("email");
    expect(parsed.searchParams.get("sub")).toEqual("0");
  });
});
