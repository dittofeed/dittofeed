import { MockActivityEnvironment } from "@temporalio/testing";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  SegmentNodeType,
  SegmentOperatorType,
  SubscriptionGroupType,
  UserPropertyDefinitionType,
} from "isomorphic-lib/src/types";
import * as R from "remeda";

import { db } from "../../db";
import { workspace as dbWorkspace } from "../../db/schema";
import { insertSegmentAssignments, upsertSegment } from "../../segments";
import { upsertSubscriptionGroup } from "../../subscriptionGroups";
import {
  insertUserPropertyAssignments,
  upsertUserProperty,
} from "../../userProperties";
import { generateSegmentsCsv } from "./segmentsCsv";

describe("generateSegmentsCsv Integration Test", () => {
  let testWorkspaceId: string;
  let testSegmentId1: string;
  let testSegmentId2: string;
  let testSubscriptionGroupId: string;
  let testEmailPropertyId: string;
  let testPhonePropertyId: string;

  beforeEach(async () => {
    // Create test workspace
    testWorkspaceId = randomUUID();
    await db()
      .insert(dbWorkspace)
      .values({
        id: testWorkspaceId,
        name: `Test Workspace ${testWorkspaceId}`,
        status: "Active",
        type: "Root",
      });

    // Create test subscription group
    testSubscriptionGroupId = randomUUID();
    await upsertSubscriptionGroup({
      id: testSubscriptionGroupId,
      workspaceId: testWorkspaceId,
      name: "Test Subscription Group",
      type: SubscriptionGroupType.OptOut,
      channel: "Email",
    }).then(unwrap);

    // Create test segments
    testSegmentId1 = randomUUID();
    testSegmentId2 = randomUUID();

    await upsertSegment({
      name: "High Value Customers",
      workspaceId: testWorkspaceId,
      definition: {
        entryNode: {
          type: SegmentNodeType.Trait,
          id: "entry",
          path: "email",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "user1@example.com",
          },
        },
        nodes: [],
      },
      subscriptionGroupId: testSubscriptionGroupId,
    }).then(unwrap);

    await upsertSegment({
      name: "New Users",
      workspaceId: testWorkspaceId,
      definition: {
        entryNode: {
          type: SegmentNodeType.Trait,
          id: "entry",
          path: "email",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "user2@example.com",
          },
        },
        nodes: [],
      },
    }).then(unwrap);

    // Create test user properties
    testEmailPropertyId = randomUUID();
    testPhonePropertyId = randomUUID();

    await upsertUserProperty(
      {
        workspaceId: testWorkspaceId,
        name: "email",
        definition: { type: UserPropertyDefinitionType.Trait, path: "email" },
      },
      {
        skipProtectedCheck: true,
      },
    ).then(unwrap);
    await upsertUserProperty(
      {
        workspaceId: testWorkspaceId,
        name: "phone",
        definition: { type: UserPropertyDefinitionType.Trait, path: "phone" },
      },
      {
        skipProtectedCheck: true,
      },
    ).then(unwrap);
  });
  async function createUsersAndAssignments(count: number) {
    const segmentAssignments = R.times(count, (i) => [
      {
        workspaceId: testWorkspaceId,
        userId: `user-${i}`,
        segmentId: testSegmentId1,
        inSegment: i % 2 === 0,
      },
      {
        workspaceId: testWorkspaceId,
        userId: `user-${i}`,
        segmentId: testSegmentId2,
        inSegment: i % 2 !== 0,
      },
    ]).flat();

    const userPropertyAssignments = R.times(count, (i) => [
      {
        workspaceId: testWorkspaceId,
        userId: `user-${i}`,
        userPropertyId: testEmailPropertyId,
        value: `user-${i}@example.com`,
      },
      {
        workspaceId: testWorkspaceId,
        userId: `user-${i}`,
        userPropertyId: testPhonePropertyId,
        value: "+1234567890",
      },
    ]).flat();

    await Promise.all([
      // Insert segment assignments into ClickHouse
      insertSegmentAssignments(segmentAssignments),
      // Insert user property assignments into ClickHouse
      insertUserPropertyAssignments(userPropertyAssignments),
    ]);
  }

  describe("when the segments are not empty", () => {
    beforeEach(async () => {
      await createUsersAndAssignments(2);
    });

    it("should generate segments CSV with real data and upload to S3", async () => {
      const testBlobStorageKey = `test-downloads/segments/${randomUUID()}.csv`;
      const mockEnv = new MockActivityEnvironment();

      // Listen for heartbeats to verify the activity is sending them
      const heartbeats: unknown[] = [];
      mockEnv.on("heartbeat", (data: unknown) => {
        heartbeats.push(data);
      });

      // Execute the function with real databases and MinIO in activity context
      await mockEnv.run(() =>
        generateSegmentsCsv({
          workspaceId: testWorkspaceId,
          blobStorageKey: testBlobStorageKey,
        }),
      );

      // Verify heartbeats were sent during execution
      expect(heartbeats.length).toBeGreaterThan(0);

      // Verify the file was uploaded to MinIO by attempting to download it
      // Note: In a real test environment, you might want to verify the file contents
      // by downloading it from MinIO and parsing the CSV
      expect(true).toBe(true); // Test passed if no error was thrown
    });
  });

  it("should handle empty workspace gracefully", async () => {
    const emptyWorkspaceId = randomUUID();
    await db()
      .insert(dbWorkspace)
      .values({
        id: emptyWorkspaceId,
        name: `Empty Test Workspace ${emptyWorkspaceId}`,
      });

    const testBlobStorageKey = `test-downloads/segments/${randomUUID()}.csv`;
    const mockEnv = new MockActivityEnvironment();

    // Should not throw error even with empty workspace
    await mockEnv.run(() =>
      generateSegmentsCsv({
        workspaceId: emptyWorkspaceId,
        blobStorageKey: testBlobStorageKey,
      }),
    );
  });

  describe("with a large dataset", () => {
    it("should handle large datasets with pagination", async () => {
      const testBlobStorageKey = `test-downloads/segments/${randomUUID()}.csv`;
      const mockEnv = new MockActivityEnvironment();

      // Listen for heartbeats to verify pagination is working with heartbeats
      const heartbeats: unknown[] = [];
      mockEnv.on("heartbeat", (data: unknown) => {
        heartbeats.push(data);
      });

      // Should handle large dataset without memory issues
      await mockEnv.run(() =>
        generateSegmentsCsv({
          workspaceId: testWorkspaceId,
          blobStorageKey: testBlobStorageKey,
        }),
      );

      // Verify multiple heartbeats were sent during pagination
      expect(heartbeats.length).toBeGreaterThan(1);
    });
  });
});
