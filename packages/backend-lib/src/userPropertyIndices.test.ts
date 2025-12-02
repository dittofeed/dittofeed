import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { clickhouseClient } from "./clickhouse";
import { db, insert } from "./db";
import {
  userProperty as dbUserProperty,
  workspace as dbWorkspace,
} from "./db/schema";
import { UserProperty, UserPropertyDefinitionType, Workspace } from "./types";
import { insertUserPropertyAssignments } from "./userProperties";
import {
  deleteUserPropertyIndex,
  getUserPropertyIndices,
  upsertUserPropertyIndex,
} from "./userPropertyIndices";

describe("User Property Indices", () => {
  let workspace: Workspace;
  let emailProperty: UserProperty;
  let ageProperty: UserProperty;

  beforeEach(async () => {
    workspace = unwrap(
      await insert({
        table: dbWorkspace,
        values: {
          id: randomUUID(),
          name: `workspace-${randomUUID()}`,
          updatedAt: new Date(),
        },
      }),
    );

    emailProperty = unwrap(
      await insert({
        table: dbUserProperty,
        values: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: "email",
          updatedAt: new Date(),
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
      }),
    );

    ageProperty = unwrap(
      await insert({
        table: dbUserProperty,
        values: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: "age",
          updatedAt: new Date(),
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "age",
          },
        },
      }),
    );

    // Create some user property assignments for testing
    await insertUserPropertyAssignments([
      {
        userPropertyId: emailProperty.id,
        workspaceId: workspace.id,
        userId: "user-1",
        value: JSON.stringify("alice@example.com"),
      },
      {
        userPropertyId: emailProperty.id,
        workspaceId: workspace.id,
        userId: "user-2",
        value: JSON.stringify("bob@example.com"),
      },
      {
        userPropertyId: ageProperty.id,
        workspaceId: workspace.id,
        userId: "user-1",
        value: JSON.stringify(25),
      },
      {
        userPropertyId: ageProperty.id,
        workspaceId: workspace.id,
        userId: "user-2",
        value: JSON.stringify(30),
      },
    ]);
  });

  describe("upsertUserPropertyIndex", () => {
    it("should create a new index and backfill data", async () => {
      await upsertUserPropertyIndex({
        workspaceId: workspace.id,
        userPropertyId: emailProperty.id,
        type: "String",
      });

      // Check Postgres
      const indices = await getUserPropertyIndices({
        workspaceId: workspace.id,
      });
      expect(indices).toHaveLength(1);
      expect(indices[0]?.userPropertyId).toBe(emailProperty.id);
      expect(indices[0]?.type).toBe("String");

      // Check ClickHouse config
      const configResult = await clickhouseClient().query({
        query: `SELECT * FROM user_property_index_config WHERE workspace_id = {workspaceId:String} AND user_property_id = {userPropertyId:String}`,
        query_params: {
          workspaceId: workspace.id,
          userPropertyId: emailProperty.id,
        },
        format: "JSONEachRow",
      });
      const configRows = await configResult.json();
      expect(configRows).toHaveLength(1);

      // Wait a bit for backfill to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check ClickHouse index table
      const indexResult = await clickhouseClient().query({
        query: `SELECT * FROM user_property_idx_str WHERE workspace_id = {workspaceId:String} AND computed_property_id = {userPropertyId:String} ORDER BY user_id`,
        query_params: {
          workspaceId: workspace.id,
          userPropertyId: emailProperty.id,
        },
        format: "JSONEachRow",
      });
      const indexRows = await indexResult.json<{
        workspace_id: string;
        computed_property_id: string;
        user_id: string;
        value_str: string;
      }>();

      expect(indexRows.length).toBeGreaterThan(0);
      const userIds = indexRows.map((row) => row.user_id);
      expect(userIds).toContain("user-1");
      expect(userIds).toContain("user-2");
    });

    it("should handle type change by pruning old data and backfilling new data", async () => {
      // Create initial string index
      await upsertUserPropertyIndex({
        workspaceId: workspace.id,
        userPropertyId: ageProperty.id,
        type: "String",
      });

      // Wait for initial backfill
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify string index has data
      const strIndexBefore = await clickhouseClient().query({
        query: `SELECT * FROM user_property_idx_str WHERE workspace_id = {workspaceId:String} AND computed_property_id = {userPropertyId:String}`,
        query_params: {
          workspaceId: workspace.id,
          userPropertyId: ageProperty.id,
        },
        format: "JSONEachRow",
      });
      const strRowsBefore = await strIndexBefore.json();
      expect(strRowsBefore.length).toBeGreaterThan(0);

      // Change to number index
      await upsertUserPropertyIndex({
        workspaceId: workspace.id,
        userPropertyId: ageProperty.id,
        type: "Number",
      });

      // Wait for prune and backfill
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check Postgres updated
      const indices = await getUserPropertyIndices({
        workspaceId: workspace.id,
      });
      const ageIndex = indices.find((i) => i.userPropertyId === ageProperty.id);
      expect(ageIndex?.type).toBe("Number");

      // Verify number index has data
      const numIndexResult = await clickhouseClient().query({
        query: `SELECT * FROM user_property_idx_num WHERE workspace_id = {workspaceId:String} AND computed_property_id = {userPropertyId:String}`,
        query_params: {
          workspaceId: workspace.id,
          userPropertyId: ageProperty.id,
        },
        format: "JSONEachRow",
      });
      const numRows = await numIndexResult.json();
      expect(numRows.length).toBeGreaterThan(0);
    });
  });

  describe("deleteUserPropertyIndex", () => {
    it("should delete index and prune data", async () => {
      // Create index first
      await upsertUserPropertyIndex({
        workspaceId: workspace.id,
        userPropertyId: emailProperty.id,
        type: "String",
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify it exists
      let indices = await getUserPropertyIndices({
        workspaceId: workspace.id,
      });
      expect(indices).toHaveLength(1);

      // Delete it
      await deleteUserPropertyIndex({
        workspaceId: workspace.id,
        userPropertyId: emailProperty.id,
      });

      // Check Postgres
      indices = await getUserPropertyIndices({
        workspaceId: workspace.id,
      });
      expect(indices).toHaveLength(0);

      // Check ClickHouse config
      const configResult = await clickhouseClient().query({
        query: `SELECT * FROM user_property_index_config WHERE workspace_id = {workspaceId:String} AND user_property_id = {userPropertyId:String}`,
        query_params: {
          workspaceId: workspace.id,
          userPropertyId: emailProperty.id,
        },
        format: "JSONEachRow",
      });
      const configRows = await configResult.json();
      expect(configRows).toHaveLength(0);
    });

    it("should handle deleting non-existent index gracefully", async () => {
      await deleteUserPropertyIndex({
        workspaceId: workspace.id,
        userPropertyId: emailProperty.id,
      });

      // Should not throw and indices should still be empty
      const indices = await getUserPropertyIndices({
        workspaceId: workspace.id,
      });
      expect(indices).toHaveLength(0);
    });
  });

  describe("getUserPropertyIndices", () => {
    it("should return all indices for a workspace", async () => {
      await upsertUserPropertyIndex({
        workspaceId: workspace.id,
        userPropertyId: emailProperty.id,
        type: "String",
      });

      await upsertUserPropertyIndex({
        workspaceId: workspace.id,
        userPropertyId: ageProperty.id,
        type: "Number",
      });

      const indices = await getUserPropertyIndices({
        workspaceId: workspace.id,
      });

      expect(indices).toHaveLength(2);
      const propertyIds = indices.map((i) => i.userPropertyId);
      expect(propertyIds).toContain(emailProperty.id);
      expect(propertyIds).toContain(ageProperty.id);
    });

    it("should return empty array when no indices exist", async () => {
      const indices = await getUserPropertyIndices({
        workspaceId: workspace.id,
      });
      expect(indices).toHaveLength(0);
    });
  });
});
