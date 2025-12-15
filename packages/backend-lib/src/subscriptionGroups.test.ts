import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { DEBUG_USER_ID1, SecretNames } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { Readable } from "stream";

import { bootstrapPostgres } from "./bootstrap";
import { db } from "./db";
import * as schema from "./db/schema";
import {
  generateSubscriptionChangeUrl,
  getUserSubscriptions,
  inSubscriptionGroup,
  parseSubscriptionGroupCsv,
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

  describe("parseSubscriptionGroupCsv", () => {
    it("should parse CSV with id column only (no email column)", async () => {
      const csvContent = `id,action
58,unsubscribe
130,unsubscribe
429,unsubscribe`;

      const stream = Readable.from([csvContent]);
      const result = await parseSubscriptionGroupCsv(stream);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(3);
        expect(result.value[0]).toEqual({ id: "58", action: "unsubscribe" });
        expect(result.value[1]).toEqual({ id: "130", action: "unsubscribe" });
        expect(result.value[2]).toEqual({ id: "429", action: "unsubscribe" });
      }
    });

    it("should parse CSV with email column only (no id column)", async () => {
      const csvContent = `email,action
test@example.com,subscribe
user@domain.com,unsubscribe`;

      const stream = Readable.from([csvContent]);
      const result = await parseSubscriptionGroupCsv(stream);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]).toEqual({
          email: "test@example.com",
          action: "subscribe",
        });
        expect(result.value[1]).toEqual({
          email: "user@domain.com",
          action: "unsubscribe",
        });
      }
    });

    it("should parse CSV with both id and email columns", async () => {
      const csvContent = `id,email,action
123,test@example.com,subscribe`;

      const stream = Readable.from([csvContent]);
      const result = await parseSubscriptionGroupCsv(stream);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toEqual({
          id: "123",
          email: "test@example.com",
          action: "subscribe",
        });
      }
    });

    it("should return error when CSV has neither id nor email headers", async () => {
      const csvContent = `name,action
John,subscribe`;

      const stream = Readable.from([csvContent]);
      const result = await parseSubscriptionGroupCsv(stream);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe('csv must have "id" or "email" headers');
      }
    });

    it("should return error for rows with empty id and no email", async () => {
      const csvContent = `id,action
,unsubscribe
123,subscribe`;

      const stream = Readable.from([csvContent]);
      const result = await parseSubscriptionGroupCsv(stream);

      expect(result.isErr()).toBe(true);
      if (result.isErr() && Array.isArray(result.error)) {
        expect(result.error).toHaveLength(1);
        expect(result.error[0]?.row).toBe(0);
      }
    });
  });
});
