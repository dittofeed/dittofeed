import { Workspace } from "@prisma/client";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { submitBatch } from "./apps";
import { clickhouseClient } from "./clickhouse";
import prisma from "./prisma";
import {
  EventType,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  UserPropertyDefinitionType,
} from "./types";
import { deleteUsers, getUsers } from "./users";

describe("getUsers", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    workspace = await prisma().workspace.create({
      data: {
        name: `workspace-${randomUUID()}`,
      },
    });
  });

  describe("when number of users is greater than the limit", () => {
    let userIds: [string, string];
    beforeEach(async () => {
      userIds = [
        "185410bb-60e0-407a-95bb-4568ad450ff9",
        "787ec382-1f3a-4375-ae7d-2dae8b863991",
      ];
      const firstNameProperty = await prisma().userProperty.create({
        data: {
          name: "firstName",
          workspaceId: workspace.id,
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "firstName",
          },
        },
      });
      await prisma().userPropertyAssignment.createMany({
        data: [
          {
            userPropertyId: firstNameProperty.id,
            workspaceId: workspace.id,
            userId: userIds[0],
            value: JSON.stringify("max"),
          },
          {
            userPropertyId: firstNameProperty.id,
            workspaceId: workspace.id,
            userId: userIds[1],
            value: JSON.stringify("chandler"),
          },
        ],
      });
    });

    it("can be paginated", async () => {
      const result1 = unwrap(
        await getUsers({
          workspaceId: workspace.id,
          limit: 1,
        }),
      );
      expect(result1.users).toEqual([
        {
          id: userIds[0],
          segments: [],
          properties: {
            firstName: "max",
          },
        },
      ]);
      expect(result1.nextCursor).not.toBeUndefined();

      const result2 = unwrap(
        await getUsers({
          workspaceId: workspace.id,
          cursor: result1.nextCursor,
          limit: 1,
        }),
      );

      expect(result2.users).toEqual([
        {
          id: userIds[1],
          segments: [],
          properties: {
            firstName: "chandler",
          },
        },
      ]);
      expect(result2.nextCursor).not.toBeUndefined();

      const result3 = unwrap(
        await getUsers({
          workspaceId: workspace.id,
          cursor: result2.nextCursor,
          limit: 1,
        }),
      );

      expect(result3.users).toHaveLength(0);
      expect(result3.nextCursor).toBeUndefined();
    });
  });

  describe("when a segmentId is passed", () => {
    let userIds: [string, string, string];
    let segmentId1: string;

    beforeEach(async () => {
      userIds = [
        "185410bb-60e0-407a-95bb-4568ad450ff9",
        "787ec382-1f3a-4375-ae7d-2dae8b863991",
        "41ca3e31-0bed-4d48-9306-d3a2d4acc025",
      ];
      const segmentDefinition1: SegmentDefinition = {
        entryNode: {
          type: SegmentNodeType.Trait,
          id: "1",
          path: "node1",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "value1",
          },
        },
        nodes: [],
      };
      const segmentDefinition2: SegmentDefinition = {
        entryNode: {
          type: SegmentNodeType.Trait,
          id: "node2",
          path: "key2",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "value2",
          },
        },
        nodes: [],
      };
      segmentId1 = randomUUID();
      const segmentId2 = randomUUID();
      await prisma().segment.createMany({
        data: [
          {
            id: segmentId1,
            workspaceId: workspace.id,
            name: `segment1`,
            definition: segmentDefinition1,
          },
          {
            id: segmentId2,
            workspaceId: workspace.id,
            name: `segment2`,
            definition: segmentDefinition2,
          },
        ],
      });

      await prisma().segmentAssignment.createMany({
        data: [
          {
            userId: userIds[0],
            inSegment: true,
            segmentId: segmentId1,
            workspaceId: workspace.id,
          },
          {
            userId: userIds[1],
            inSegment: false,
            segmentId: segmentId1,
            workspaceId: workspace.id,
          },
          {
            userId: userIds[2],
            inSegment: true,
            segmentId: segmentId2,
            workspaceId: workspace.id,
          },
        ],
      });
    });

    it("filters users by segment id", async () => {
      const result = unwrap(
        await getUsers({
          workspaceId: workspace.id,
          segmentId: segmentId1,
        }),
      );

      expect(result).toEqual({
        users: [
          {
            id: userIds[0],
            segments: [segmentId1],
            properties: {},
          },
        ],
      });
    });
  });

  describe("deleteUsers", () => {
    let userIds: [string, string];

    beforeEach(async () => {
      userIds = [
        "185410bb-60e0-407a-95bb-4568ad450ff9",
        "787ec382-1f3a-4375-ae7d-2dae8b863991",
      ];
      const firstNameProperty = await prisma().userProperty.create({
        data: {
          name: "firstName",
          workspaceId: workspace.id,
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "firstName",
          },
        },
      });
      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [
            {
              userId: userIds[0],
              type: EventType.Identify,
              messageId: "1",
              traits: {
                firstName: "max",
              },
            },
            {
              userId: userIds[1],
              type: EventType.Identify,
              messageId: "2",
              traits: {
                firstName: "chandler",
              },
            },
          ],
        },
      });
      await Promise.all([
        prisma().userPropertyAssignment.createMany({
          data: [
            {
              userPropertyId: firstNameProperty.id,
              workspaceId: workspace.id,
              userId: userIds[0],
              value: JSON.stringify("max"),
            },
            {
              userPropertyId: firstNameProperty.id,
              workspaceId: workspace.id,
              userId: userIds[1],
              value: JSON.stringify("chandler"),
            },
          ],
        }),
      ]);
    });
    it("deletes users", async () => {
      await deleteUsers({
        workspaceId: workspace.id,
        userIds: [userIds[0]],
      });
      const eventsQuery = `select * from user_events_v2 where workspace_id = '${workspace.id}'`;
      const events: { data: unknown[] } = await (
        await clickhouseClient().query({
          query: eventsQuery,
        })
      ).json();
      expect(events.data).toHaveLength(1);
      expect(events.data[0]).toEqual(
        expect.objectContaining({ user_id: userIds[1] }),
      );
      const userPropertyAssignments =
        await prisma().userPropertyAssignment.findMany({
          where: {
            workspaceId: workspace.id,
          },
        });
      expect(userPropertyAssignments).toHaveLength(1);
      expect(userPropertyAssignments[0]?.userId).toEqual(userIds[1]);
    });
  });
});
