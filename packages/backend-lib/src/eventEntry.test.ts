import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { createEnvAndWorker } from "../test/temporal";
import { db, insert } from "./db";
import {
  journey as dbJourney,
  segment as dbSegment,
  userJourneyEvent as dbUserJourneyEvent,
} from "./db/schema";
import {
  userJourneyWorkflow,
  UserJourneyWorkflowVersion,
} from "./journeys/userWorkflow";
import { insertSegmentAssignments } from "./segments";
import {
  ChannelType,
  Journey,
  JourneyDefinition,
  JourneyNodeType,
  MessageNode,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentSplitNode,
  SegmentSplitVariantType,
  Workspace,
} from "./types";
import { createWorkspace } from "./workspaces";

jest.setTimeout(15000);

describe("eventEntry journeys", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  const testActivities = {
    sendMessageV2: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    workspace = await createWorkspace({
      name: `event-entry-${randomUUID()}`,
      updatedAt: new Date(),
      id: randomUUID(),
    }).then(unwrap);

    const envAndWorker = await createEnvAndWorker({
      activityOverrides: testActivities,
    });
    testEnv = envAndWorker.testEnv;
    worker = envAndWorker.worker;
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  describe("when a user is pre-assigned to a segment", () => {
    let userId: string;
    let journey: Journey;
    let journeyDefinition: JourneyDefinition;
    beforeEach(async () => {
      userId = "user1";
      const segmentId = randomUUID();
      await db()
        .insert(dbSegment)
        .values({
          id: segmentId,
          workspaceId: workspace.id,
          name: "test-segment",
          updatedAt: new Date(),
          definition: {
            entryNode: {
              id: randomUUID(),
              type: SegmentNodeType.Trait,
              path: "key",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "val",
              },
            },
            nodes: [],
          } satisfies SegmentDefinition,
        });
      await insertSegmentAssignments([
        {
          segmentId,
          userId,
          workspaceId: workspace.id,
          inSegment: true,
        },
      ]);
      journeyDefinition = {
        entryNode: {
          type: JourneyNodeType.EventEntryNode,
          event: "test",
          child: "segment-split-node",
        },
        nodes: [
          {
            type: JourneyNodeType.SegmentSplitNode,
            id: "segment-split-node",
            variant: {
              type: SegmentSplitVariantType.Boolean,
              segment: segmentId,
              trueChild: "message-node",
              falseChild: JourneyNodeType.ExitNode,
            },
          } satisfies SegmentSplitNode,
          {
            type: JourneyNodeType.MessageNode,
            id: "message-node",
            child: JourneyNodeType.ExitNode,
            variant: {
              type: ChannelType.Email,
              templateId: "test-template",
            },
          } satisfies MessageNode,
        ],
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
      };
      journey = await insert({
        table: dbJourney,
        values: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: "test-journey",
          definition: journeyDefinition,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }).then(unwrap);
    });
    it("segment splits should respect the pre-assignment", async () => {
      await worker.runUntil(async () => {
        await testEnv.client.workflow.execute(userJourneyWorkflow, {
          workflowId: "workflow1",
          taskQueue: "default",
          args: [
            {
              journeyId: journey.id,
              workspaceId: workspace.id,
              userId,
              definition: journeyDefinition,
              version: UserJourneyWorkflowVersion.V2,
              event: {
                event: "test",
                properties: {
                  key: "val",
                },
                messageId: randomUUID(),
                timestamp: new Date().toISOString(),
              },
            },
          ],
        });
        expect(testActivities.sendMessageV2).toHaveBeenCalledTimes(1);
        const events = await db()
          .select()
          .from(dbUserJourneyEvent)
          .where(
            and(
              eq(dbUserJourneyEvent.journeyId, journey.id),
              eq(dbUserJourneyEvent.userId, userId),
            ),
          );
        expect(events).toHaveLength(4);
      });
    });
  });
});
