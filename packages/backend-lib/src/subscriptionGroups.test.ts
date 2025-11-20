import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { DEBUG_USER_ID1, SecretNames } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { bootstrapPostgres } from "./bootstrap";
import { db } from "./db";
import * as schema from "./db/schema";
import {
  generateSubscriptionChangeUrl,
  getUserSubscriptions,
  inSubscriptionGroup,
  upsertSubscriptionGroup,
} from "./subscriptionGroups";
import {
  ChannelType,
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
  describe("getUserSubscriptions", () => {
    let workspaceId: string;
    let userId: string;

    beforeEach(async () => {
      userId = DEBUG_USER_ID1;
      const workspaceName = randomUUID();

      const bootstrapResult = unwrap(
        await bootstrapPostgres({
          workspaceName,
          workspaceType: WorkspaceTypeAppEnum.Root,
        }),
      );
      workspaceId = bootstrapResult.id;
    });

    it("should return isSubscribed true for opt-out subscription groups when user has not opted out", async () => {
      // Create an opt-out subscription group
      const optOutGroup = unwrap(
        await upsertSubscriptionGroup({
          workspaceId,
          name: "Marketing Emails",
          type: SubscriptionGroupType.OptOut,
          channel: ChannelType.Email,
        }),
      );

      // Get user subscriptions without the user having any segment assignments
      const subscriptions = await getUserSubscriptions({
        workspaceId,
        userId,
      });

      // Find the opt-out subscription group
      const optOutSubscription = subscriptions.find(
        (s) => s.id === optOutGroup.id,
      );

      // User should be subscribed to opt-out group by default (no explicit unsubscribe)
      expect(optOutSubscription).toBeDefined();
      expect(optOutSubscription?.isSubscribed).toBe(true);
    });

    it("should return isSubscribed false for opt-in subscription groups when user has not opted in", async () => {
      // Create an opt-in subscription group
      const optInGroup = unwrap(
        await upsertSubscriptionGroup({
          workspaceId,
          name: "Newsletter",
          type: SubscriptionGroupType.OptIn,
          channel: ChannelType.Email,
        }),
      );

      // Get user subscriptions without the user having any segment assignments
      const subscriptions = await getUserSubscriptions({
        workspaceId,
        userId,
      });

      // Find the opt-in subscription group
      const optInSubscription = subscriptions.find(
        (s) => s.id === optInGroup.id,
      );

      // User should NOT be subscribed to opt-in group by default (no explicit subscribe)
      expect(optInSubscription).toBeDefined();
      expect(optInSubscription?.isSubscribed).toBe(false);
    });
  });
});
