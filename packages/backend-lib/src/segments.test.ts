import { UserProperty, Workspace } from "@prisma/client";
import { randomUUID } from "crypto";

import { clickhouseClient } from "./clickhouse";
import prisma from "./prisma";
import {
  buildSegmentsFile,
  findRecentlyUpdatedUsersInSegment,
} from "./segments";
import {
  IdUserPropertyDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  TraitSegmentNode,
  TraitUserPropertyDefinition,
  UserPropertyDefinitionType,
} from "./types";

describe("segments", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = await prisma().workspace.create({
      data: {
        name: `test-${randomUUID()}`,
      },
    });
  });
  describe("buildSegmentsFile", () => {
    let userIdProperty: UserProperty;
    let emailProperty: UserProperty;
    let phoneProperty: UserProperty;
    let userId: string;

    beforeEach(async () => {
      userId = randomUUID();
      const segment = await prisma().segment.create({
        data: {
          name: "test",
          workspaceId: workspace.id,
          definition: {
            id: randomUUID(),
            type: SegmentNodeType.Trait,
            path: "name",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "test",
            },
          } satisfies TraitSegmentNode,
        },
      });
      [userIdProperty, emailProperty, phoneProperty] = await Promise.all([
        prisma().userProperty.create({
          data: {
            name: "id",
            workspaceId: workspace.id,
            definition: {
              type: UserPropertyDefinitionType.Id,
            } satisfies IdUserPropertyDefinition,
          },
        }),
        prisma().userProperty.create({
          data: {
            name: "email",
            workspaceId: workspace.id,
            definition: {
              type: UserPropertyDefinitionType.Trait,
              path: "email",
            } satisfies TraitUserPropertyDefinition,
          },
        }),
        prisma().userProperty.create({
          data: {
            name: "phone",
            workspaceId: workspace.id,
            definition: {
              type: UserPropertyDefinitionType.Trait,
              path: "phone",
            } satisfies TraitUserPropertyDefinition,
          },
        }),
        prisma().segmentAssignment.create({
          data: {
            segmentId: segment.id,
            workspaceId: workspace.id,
            userId,
            inSegment: true,
          },
        }),
      ]);
    });

    describe("when the identifiers contain valid values", () => {
      beforeEach(async () => {
        await Promise.all([
          prisma().userPropertyAssignment.create({
            data: {
              userId,
              userPropertyId: userIdProperty.id,
              value: "123",
              workspaceId: workspace.id,
            },
          }),
          prisma().userPropertyAssignment.create({
            data: {
              userId,
              userPropertyId: emailProperty.id,
              value: "test@test.com",
              workspaceId: workspace.id,
            },
          }),
          prisma().userPropertyAssignment.create({
            data: {
              userId,
              userPropertyId: phoneProperty.id,
              value: "1234567890",
              workspaceId: workspace.id,
            },
          }),
        ]);
      });
      it("generates a file name with its contents", async () => {
        const { fileName, fileContent } = await buildSegmentsFile({
          workspaceId: workspace.id,
        });
        expect(fileName).toBeDefined();
        expect(fileContent).toBeDefined();
        expect(fileContent.length).toBeGreaterThan(0);
      });
    });
  });
  describe("findRecentlyUpdatedUsersInSegment", () => {
    let segmentId: string;

    beforeEach(async () => {
      segmentId = randomUUID();
      await clickhouseClient().insert({
        table: `computed_property_assignments_v2 (workspace_id, type, computed_property_id, user_id, segment_value, user_property_value, max_event_time, assigned_at)`,
        values: [
          {
            workspace_id: workspace.id,
            type: "segment",
            computed_property_id: segmentId,
            user_id: "1",
            segment_value: true,
            user_property_value: "",
            max_event_time: new Date().toISOString(),
            assigned_at: new Date().toISOString(),
          },
          {
            workspace_id: workspace.id,
            type: "segment",
            computed_property_id: randomUUID(),
            user_id: "2",
            segment_value: true,
            user_property_value: "",
            max_event_time: new Date().toISOString(),
            assigned_at: new Date().toISOString(),
          },
          {
            workspace_id: workspace.id,
            type: "segment",
            computed_property_id: segmentId,
            user_id: "3",
            segment_value: true,
            user_property_value: "",
            max_event_time: new Date(
              Date.now() - 1000 * 60 * 60 * 24 * 10,
            ).toISOString(),
            assigned_at: new Date(
              Date.now() - 1000 * 60 * 60 * 24 * 10,
            ).toISOString(),
          },
          {
            workspace_id: workspace.id,
            type: "segment",
            computed_property_id: segmentId,
            user_id: "4",
            segment_value: false,
            user_property_value: "",
            max_event_time: new Date().toISOString(),
            assigned_at: new Date().toISOString(),
          },
        ],
        format: "JSONEachRow",
        clickhouse_settings: { wait_end_of_query: 1 },
      });
    });
    it("returns the users that have been added to the segment recently", async () => {
      const users = await findRecentlyUpdatedUsersInSegment({
        workspaceId: workspace.id,
        segmentId,
        assignedSince: Date.now() - 5000,
        pageSize: 10,
      });
      expect(users).toEqual([{ userId: "1" }]);
    });
  });
});
