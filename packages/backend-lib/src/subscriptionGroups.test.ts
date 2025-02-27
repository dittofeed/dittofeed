import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { DEBUG_USER_ID1, SecretNames } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { bootstrapPostgres } from "./bootstrap";
import { db } from "./db";
import * as schema from "./db/schema";
import {
  generateSubscriptionChangeUrl,
  inSubscriptionGroup,
} from "./subscriptionGroups";
import {
  SubscriptionChange,
  SubscriptionGroup,
  SubscriptionGroupType,
  WorkspaceTypeAppEnum,
} from "./types";
import { insertUserPropertyAssignments } from "./userProperties";

describe("subscriptionGroups", () => {
  describe("inSubscriptionGroup", () => {
    it("when action is unsubscribe and opt-out, it returns false", () => {
      const result = inSubscriptionGroup({
        action: SubscriptionChange.Unsubscribe,
        type: SubscriptionGroupType.OptOut,
        id: randomUUID(),
      });
      expect(result).toBe(false);
    });
  });
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

      const bootstrapResult = unwrap(
        await bootstrapPostgres({
          workspaceName,
          workspaceType: WorkspaceTypeAppEnum.Root,
        }),
      );
      workspaceId = bootstrapResult.id;

      const results = await Promise.all([
        db().query.userProperty.findFirst({
          where: and(
            eq(schema.userProperty.workspaceId, workspaceId),
            eq(schema.userProperty.name, "email"),
          ),
        }),
        db().query.subscriptionGroup.findFirst({
          where: and(
            eq(schema.subscriptionGroup.workspaceId, workspaceId),
            eq(schema.subscriptionGroup.name, `${workspaceName} - Email`),
          ),
        }),
      ]);
      const [up] = results;
      if (!up || !results[1]) {
        throw new Error("No user property or subscription group found");
      }
      // eslint-disable-next-line prefer-destructuring
      subscriptionGroup = results[1];

      await insertUserPropertyAssignments([
        {
          workspaceId,
          value: JSON.stringify(email),
          userPropertyId: up.id,
          userId,
        },
      ]);
    });
    it("should generate a valid URL", async () => {
      const secret = await db().query.secret.findFirst({
        where: and(
          eq(schema.secret.workspaceId, workspaceId),
          eq(schema.secret.name, SecretNames.Subscription),
        ),
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
