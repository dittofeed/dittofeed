import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ok } from "neverthrow";

import { createEnvAndWorker } from "../test/temporal";
import { db, insert } from "./db";
import {
  journey as dbJourney,
  messageTemplate as dbMessageTemplate,
  segment as dbSegment,
  userJourneyEvent as dbUserJourneyEvent,
  userProperty as dbUserProperty,
} from "./db/schema";
import {
  userJourneyWorkflow,
  UserJourneyWorkflowVersion,
} from "./journeys/userWorkflow";
import { sendMessageFactory } from "./journeys/userWorkflow/activities";
import { insertSegmentAssignments } from "./segments";
import {
  ChannelType,
  EmailProviderType,
  InternalEventType,
  Journey,
  JourneyDefinition,
  JourneyNodeType,
  MessageNode,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentSplitNode,
  SegmentSplitVariantType,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  Workspace,
} from "./types";
import { createWorkspace } from "./workspaces";

jest.setTimeout(15000);

describe("eventEntry journeys", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  beforeEach(async () => {
    workspace = await createWorkspace({
      name: `event-entry-${randomUUID()}`,
    }).then(unwrap);
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  describe.only("testing calls to the inner send message", () => {
    const senderMock = jest.fn().mockReturnValue(
      ok({
        type: InternalEventType.MessageSent,
        variant: {
          type: ChannelType.Email,
          from: "test@test.com",
          body: "test",
          to: "test@test.com",
          subject: "test",
          headers: {},
          replyTo: "test@test.com",
          provider: {
            type: EmailProviderType.Test,
          },
        },
      }),
    );

    const testActivities = {
      sendMessageV2: sendMessageFactory(senderMock),
    };
    beforeEach(async () => {
      const envAndWorker = await createEnvAndWorker({
        activityOverrides: testActivities,
      });
      testEnv = envAndWorker.testEnv;
      worker = envAndWorker.worker;
    });
    describe("when messaging a user with an anyof performed user property", () => {
      let journeyId: string;
      let journeyDefinition: JourneyDefinition;
      beforeEach(async () => {
        await db()
          .insert(dbUserProperty)
          .values([
            {
              workspaceId: workspace.id,
              name: "carrier",
              updatedAt: new Date(),
              definition: {
                type: UserPropertyDefinitionType.Group,
                entry: "0",
                nodes: [
                  {
                    id: "0",
                    type: UserPropertyDefinitionType.AnyOf,
                    children: ["1", "2", "3", "4"],
                  },
                  {
                    id: "1",
                    type: UserPropertyDefinitionType.Performed,
                    event: "tracking_update",
                    path: "data.carrier",
                  },
                ],
              } satisfies UserPropertyDefinition,
            },
          ]);
        const templateId = randomUUID();
        await db().insert(dbMessageTemplate).values({
          id: templateId,
          workspaceId: workspace.id,
          name: "test-template",
        });
        journeyId = randomUUID();
        journeyDefinition = {
          entryNode: {
            type: JourneyNodeType.EventEntryNode,
            event: "tracking_update",
            child: "message-node",
          },
          exitNode: {
            type: JourneyNodeType.ExitNode,
          },
          nodes: [
            {
              type: JourneyNodeType.MessageNode,
              id: "message-node",
              child: JourneyNodeType.ExitNode,
              variant: {
                type: ChannelType.Email,
                templateId,
              },
            },
          ],
        };
        await db().insert(dbJourney).values({
          id: journeyId,
          name: "test-journey",
          workspaceId: workspace.id,
          definition: journeyDefinition,
        });
      });
      it("should call the inner send message", async () => {
        await worker.runUntil(async () => {
          const userId = randomUUID();
          await testEnv.client.workflow.execute(userJourneyWorkflow, {
            workflowId: "workflow1",
            taskQueue: "default",
            args: [
              {
                journeyId,
                workspaceId: workspace.id,
                userId,
                definition: journeyDefinition,
                version: UserJourneyWorkflowVersion.V2,
                event: {
                  event: "tracking_update",
                  messageId: randomUUID(),
                  timestamp: new Date().toISOString(),
                  properties: {
                    carrier: "UPS",
                  },
                },
              },
            ],
          });
          expect(senderMock).toHaveBeenCalledTimes(1);
          expect(senderMock).toHaveBeenCalledWith(
            expect.objectContaining({
              userPropertyAssignments: expect.objectContaining({
                carrier: "UPS",
              }),
            }),
          );
        });
      });
    });
  });
  describe("testing calls to sendMessageV2", () => {
    const testActivities = {
      sendMessageV2: jest.fn().mockReturnValue(true),
    };
    beforeEach(async () => {
      const envAndWorker = await createEnvAndWorker({
        activityOverrides: testActivities,
      });
      testEnv = envAndWorker.testEnv;
      worker = envAndWorker.worker;
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
            workspaceId: workspace.id,
            name: "test-journey",
            definition: journeyDefinition,
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
});
