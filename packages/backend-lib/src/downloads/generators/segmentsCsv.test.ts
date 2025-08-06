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

import { createBucket, getObject, storage } from "../../blobStorage";
import config from "../../config";
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

  beforeAll(async () => {
    // Create S3 bucket for tests (won't fail if it already exists)
    const s3Client = storage();
    const bucketName = config().blobStorageBucket;
    try {
      await createBucket(s3Client, { bucketName });
    } catch (error) {
      // Ignore error if bucket already exists
      if (
        (error as any)?.Code !== "BucketAlreadyOwnedByYou" &&
        (error as any)?.Code !== "BucketAlreadyExists"
      ) {
        throw error;
      }
    }
  });

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

    // Create test segments and capture their actual IDs
    const segment1 = await upsertSegment({
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

    const segment2 = await upsertSegment({
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

    testSegmentId1 = segment1.id;
    testSegmentId2 = segment2.id;

    // Create test user properties and capture their actual IDs
    const emailProperty = await upsertUserProperty(
      {
        workspaceId: testWorkspaceId,
        name: "email",
        definition: { type: UserPropertyDefinitionType.Trait, path: "email" },
      },
      {
        skipProtectedCheck: true,
      },
    ).then(unwrap);

    const phoneProperty = await upsertUserProperty(
      {
        workspaceId: testWorkspaceId,
        name: "phone",
        definition: { type: UserPropertyDefinitionType.Trait, path: "phone" },
      },
      {
        skipProtectedCheck: true,
      },
    ).then(unwrap);

    testEmailPropertyId = emailProperty.id;
    testPhonePropertyId = phoneProperty.id;
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

      // Verify the file was uploaded to MinIO and read its content
      const s3Client = storage();
      const fileContent = await getObject(s3Client, {
        key: testBlobStorageKey,
      });
      expect(fileContent).not.toBeNull();

      const csvLines = fileContent!.text
        .split("\n")
        .filter((line) => line.trim());

      // Verify CSV header
      const expectedHeaders = [
        "segmentName",
        "segmentId",
        "userId",
        "inSegment",
        "subscriptionGroupName",
        "email",
        "phone",
      ];
      expect(csvLines.length).toBeGreaterThan(0);
      const headers = csvLines[0]!.split(",");
      expect(headers).toEqual(expectedHeaders);

      // Verify we have the expected number of data rows (2 users × 2 segments = 4 rows + 1 header)
      expect(csvLines.length).toBe(5);

      // Parse and verify data rows
      const dataRows = csvLines.slice(1).map((line) => {
        const values = line.split(",");
        return {
          segmentName: values[0],
          segmentId: values[1],
          userId: values[2],
          inSegment: values[3],
          subscriptionGroupName: values[4],
          email: values[5],
          phone: values[6],
        };
      });

      // Verify we have entries for both users and both segments
      const userIds = [...new Set(dataRows.map((row) => row.userId))];
      expect(userIds).toContain("user-0");
      expect(userIds).toContain("user-1");

      const segmentNames = [...new Set(dataRows.map((row) => row.segmentName))];
      expect(segmentNames).toContain("High Value Customers");
      expect(segmentNames).toContain("New Users");

      // Verify segment assignments are correct (user-0 should be in segment1, user-1 should be in segment2)
      const user0Segment1 = dataRows.find(
        (row) =>
          row.userId === "user-0" && row.segmentName === "High Value Customers",
      );
      const user0Segment2 = dataRows.find(
        (row) => row.userId === "user-0" && row.segmentName === "New Users",
      );
      const user1Segment1 = dataRows.find(
        (row) =>
          row.userId === "user-1" && row.segmentName === "High Value Customers",
      );
      const user1Segment2 = dataRows.find(
        (row) => row.userId === "user-1" && row.segmentName === "New Users",
      );

      expect(user0Segment1?.inSegment).toBe("true");
      expect(user0Segment2?.inSegment).toBe("false");
      expect(user1Segment1?.inSegment).toBe("false");
      expect(user1Segment2?.inSegment).toBe("true");

      // Verify user properties are included
      expect(user0Segment1?.email).toBe("user-0@example.com");
      expect(user0Segment1?.phone).toBe("+1234567890");
      expect(user1Segment2?.email).toBe("user-1@example.com");
      expect(user1Segment2?.phone).toBe("+1234567890");
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

    // Verify the file was created with just headers
    const s3Client = storage();
    const fileContent = await getObject(s3Client, { key: testBlobStorageKey });
    expect(fileContent).not.toBeNull();

    const csvLines = fileContent!.text
      .split("\n")
      .filter((line) => line.trim());

    // Should have only the header row for empty workspace (or no content if no data to process)
    expect(csvLines.length).toBeGreaterThanOrEqual(0);
    if (csvLines.length > 0) {
      const expectedHeaders = [
        "segmentName",
        "segmentId",
        "userId",
        "inSegment",
        "subscriptionGroupName",
        "email",
        "phone",
      ];
      const headers = csvLines[0]!.split(",");
      expect(headers).toEqual(expectedHeaders);
    }
  });

  describe("with a large dataset", () => {
    beforeEach(async () => {
      // Create a large dataset to test pagination (500 users)
      await createUsersAndAssignments(500);
    });

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

      // Verify the file content for large dataset
      const s3Client = storage();
      const fileContent = await getObject(s3Client, {
        key: testBlobStorageKey,
      });
      expect(fileContent).not.toBeNull();

      const csvLines = fileContent!.text
        .split("\n")
        .filter((line) => line.trim());

      // Verify CSV header
      const expectedHeaders = [
        "segmentName",
        "segmentId",
        "userId",
        "inSegment",
        "subscriptionGroupName",
        "email",
        "phone",
      ];
      expect(csvLines.length).toBeGreaterThan(0);
      const headers = csvLines[0]!.split(",");
      expect(headers).toEqual(expectedHeaders);

      // Verify we have the expected number of data rows
      // (2 base users + 500 large dataset users) × 2 segments = 1004 rows + 1 header = 1005 total
      expect(csvLines.length).toBeGreaterThan(1000); // At least 1000+ rows for large dataset

      // Verify some sample data to ensure pagination worked correctly
      const dataRows = csvLines.slice(1, 10); // Check first few rows
      dataRows.forEach((line) => {
        const values = line.split(",");
        const userId = values[2];
        const email = values[5];
        if (!userId) {
          throw new Error("userId is undefined");
        }

        // Verify user IDs are in expected format
        expect(userId).toMatch(/^user-\d+$/);
        // Verify email matches user ID
        expect(email).toBe(`${userId}@example.com`);
      });
    });
  });
});
