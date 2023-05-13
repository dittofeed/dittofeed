import {
  DEBUG_USER_ID1,
  SUBSCRIPTION_SECRET_NAME,
} from "isomorphic-lib/src/constants";

import config from "./config";
import logger from "./logger";
import prisma from "./prisma";
import { generateSubscriptionChangeUrl } from "./subscriptionGroups";

describe("generateSubscriptionChangeUrl", () => {
  let userId: string;
  let email: string;
  let secret: string;
  beforeEach(async () => {
    userId = DEBUG_USER_ID1;
    email = "max@email.com";
    secret = "my-subscription-secret";

    const up = await prisma().userProperty.findUniqueOrThrow({
      where: {
        workspaceId_name: {
          workspaceId: config().defaultWorkspaceId,
          name: "email",
        },
      },
    });

    await prisma().secret.findUniqueOrThrow({
      where: {
        workspaceId_name: {
          workspaceId: config().defaultWorkspaceId,
          name: SUBSCRIPTION_SECRET_NAME,
        },
      },
    });

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
      w: config().defaultWorkspaceId,
      i: email,
      ik: "email",
      s: secret,
    });

    if (url.isErr()) {
      throw url.error;
    }

    const fullUrl = `http://localhost:3000${url.value}`;
    const parsed = new URL(fullUrl);
    logger().debug({
      fullUrl,
    });
    expect(parsed.pathname).toEqual("/dashboard/subscription-management");
    expect(parsed.searchParams.get("w")).toEqual(config().defaultWorkspaceId);
    expect(parsed.searchParams.get("i")).toEqual(email);
    expect(parsed.searchParams.get("ik")).toEqual("email");
    expect(parsed.searchParams.get("sub")).toEqual("0");
    expect(parsed.searchParams.get("h")).toEqual(
      "db1638d4a726a149ed8d810510ebdf2297318344a64d5aecc3f8746d83fbfcd1"
    );
  });
});
