import { Segment, Workspace } from "@prisma/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { WorkflowNotFoundError } from "@temporalio/workflow";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { segmentIdentifyEvent } from "../../test/factories/segment";
import { createEnvAndWorker } from "../../test/temporal";
import { clickhouseClient, getChCompatibleUuid } from "../clickhouse";
import { enrichJourney } from "../journeys";
import prisma from "../prisma";
import {
  ComputedPropertiesWorkflowParams,
  computePropertiesWorkflow,
} from "../segments/computePropertiesWorkflow";
import { upsertSubscriptionGroup } from "../subscriptionGroups";
import {
  ChannelType,
  DelayVariantType,
  EnrichedJourney,
  JourneyDefinition,
  JourneyNodeType,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentSplitVariantType,
  SubscriptionGroupType,
} from "../types";
import {
  createUserEventsTables,
  insertUserEvents,
} from "../userEvents/clickhouse";

const paidSegmentDefinition: SegmentDefinition = {
  entryNode: {
    type: SegmentNodeType.Trait,
    id: randomUUID(),
    path: "plan",
    operator: {
      type: SegmentOperatorType.Equals,
      value: "paid",
    },
  },
  nodes: [],
};

jest.setTimeout(15000);

describe("end to end journeys", () => {
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  const testActivities = {
    sendEmail: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const envAndWorker = await createEnvAndWorker({
      activityOverrides: testActivities,
    });
    testEnv = envAndWorker.testEnv;
    worker = envAndWorker.worker;
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  afterAll(async () => {
    await clickhouseClient().close();
  });

  describe("onboarding journey", () => {
    let journey: EnrichedJourney;
    let tableVersion: string;
    let workspace: Workspace;
    let userId1: string;
    let userId2: string;
    let userJourneyWorkflowId: string;

    beforeEach(async () => {
      tableVersion = getChCompatibleUuid();
      await createUserEventsTables({ tableVersion });

      workspace = await prisma().workspace.create({
        data: { name: `workspace-${randomUUID()}` },
      });

      userId1 = `user1-${randomUUID()}`;
      userId2 = `user2-${randomUUID()}`;
    });

    describe("when a user is created after the journey start date", () => {
      let recentlyCreatedSegment: Segment;
      let paidAccountSegment: Segment;

      beforeEach(async () => {
        const recentlyCreatedSegmentDefinition: SegmentDefinition = {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: randomUUID(),
            path: "createdAt",
            operator: {
              type: SegmentOperatorType.Within,
              windowSeconds: 30 * 60,
            },
          },
          nodes: [],
        };

        recentlyCreatedSegment = await prisma().segment.create({
          data: {
            name: `recently-created-${randomUUID()}`,
            workspaceId: workspace.id,
            definition: recentlyCreatedSegmentDefinition,
          },
        });

        paidAccountSegment = await prisma().segment.create({
          data: {
            workspaceId: workspace.id,
            name: `paid-${randomUUID()}`,
            definition: paidSegmentDefinition,
          },
        });

        const nodeId1 = randomUUID();
        const nodeId2 = randomUUID();
        const nodeId3 = randomUUID();

        const journeyDefinition: JourneyDefinition = {
          entryNode: {
            type: JourneyNodeType.EntryNode,
            segment: recentlyCreatedSegment.id,
            child: nodeId1,
          },
          exitNode: {
            type: JourneyNodeType.ExitNode,
          },
          nodes: [
            {
              type: JourneyNodeType.DelayNode,
              id: nodeId1,
              variant: {
                type: DelayVariantType.Second,
                seconds: 7 * 24 * 60 * 60,
              },
              child: nodeId2,
            },
            {
              type: JourneyNodeType.SegmentSplitNode,
              id: nodeId2,
              variant: {
                type: SegmentSplitVariantType.Boolean,
                segment: paidAccountSegment.id,
                falseChild: nodeId3,
                trueChild: JourneyNodeType.ExitNode,
              },
            },
            {
              type: JourneyNodeType.MessageNode,
              id: nodeId3,
              child: JourneyNodeType.ExitNode,
              variant: {
                type: ChannelType.Email,
                templateId: randomUUID(),
              },
            },
          ],
        };

        journey = unwrap(
          enrichJourney(
            await prisma().journey.create({
              data: {
                name: `user-journey-${randomUUID()}`,
                workspaceId: workspace.id,
                definition: journeyDefinition,
                status: "Running",
              },
            })
          )
        );

        const currentTimeMS = await testEnv.currentTimeMs();

        await insertUserEvents({
          tableVersion,
          workspaceId: workspace.id,
          events: [
            {
              messageId: randomUUID(),
              processingTime: new Date(currentTimeMS - 5000).toISOString(),
              messageRaw: segmentIdentifyEvent({
                userId: userId1,
                timestamp: new Date(currentTimeMS - 10000).toISOString(),
                traits: {
                  plan: "free",
                  createdAt: new Date(currentTimeMS - 15000).toISOString(),
                },
              }),
            },
            {
              messageId: randomUUID(),
              processingTime: new Date(currentTimeMS - 5000).toISOString(),
              messageRaw: segmentIdentifyEvent({
                userId: userId2,
                timestamp: new Date(currentTimeMS - 10000).toISOString(),
                traits: {
                  plan: "paid",
                  createdAt: new Date(currentTimeMS - 15000).toISOString(),
                },
              }),
            },
          ],
        });

        userJourneyWorkflowId = `user-journey-${journey.id}-${userId1}`;
      });

      it("sends them a welcome email", async () => {
        const segmentWorkflow1 = `segments-notification-workflow-${randomUUID()}`;

        await worker.runUntil(async () => {
          await testEnv.client.workflow.start(computePropertiesWorkflow, {
            workflowId: segmentWorkflow1,
            taskQueue: "default",
            args: [
              {
                tableVersion,
                workspaceId: workspace.id,
                maxPollingAttempts: 1,
                shouldContinueAsNew: false,
              },
            ],
          });

          const handle3 = testEnv.client.workflow.getHandle(segmentWorkflow1);
          await handle3.result();

          await testEnv.sleep("1.5 weeks");

          const handle = testEnv.client.workflow.getHandle(
            userJourneyWorkflowId
          );

          const userJourneyWorkflowId2 = `user-journey-${journey.id}-${userId2}`;
          const handle2 = testEnv.client.workflow.getHandle(
            userJourneyWorkflowId2
          );

          await Promise.all([handle.result(), handle2.result()]);
        });

        expect(testActivities.sendEmail).toHaveBeenCalledTimes(1);
      });
    });

    describe("when a journey goes through status transitions", () => {
      let paidAccountSegment: Segment;

      beforeEach(async () => {
        paidAccountSegment = await prisma().segment.create({
          data: {
            workspaceId: workspace.id,
            name: `paid-${randomUUID()}`,
            definition: paidSegmentDefinition,
          },
        });

        const nodeId1 = randomUUID();

        const subscriptionGroup = unwrap(
          await upsertSubscriptionGroup({
            id: randomUUID(),
            workspaceId: workspace.id,
            name: "default",
            type: SubscriptionGroupType.OptIn,
            channel: ChannelType.Email,
          })
        );

        const journeyDefinition: JourneyDefinition = {
          entryNode: {
            type: JourneyNodeType.EntryNode,
            segment: paidAccountSegment.id,
            child: nodeId1,
          },
          exitNode: {
            type: JourneyNodeType.ExitNode,
          },
          nodes: [
            {
              type: JourneyNodeType.MessageNode,
              id: nodeId1,
              child: "ExitNode",
              subscriptionGroupId: subscriptionGroup.id,
              variant: {
                type: ChannelType.Email,
                templateId: randomUUID(),
              },
            },
          ],
        };

        journey = unwrap(
          enrichJourney(
            await prisma().journey.create({
              data: {
                name: `user-journey-${randomUUID()}`,
                workspaceId: workspace.id,
                definition: journeyDefinition,
                status: "NotStarted",
              },
            })
          )
        );

        userJourneyWorkflowId = `user-journey-${journey.id}-${userId1}`;

        const currentTimeMS = await testEnv.currentTimeMs();

        await insertUserEvents({
          tableVersion,

          workspaceId: workspace.id,
          events: [
            {
              messageId: randomUUID(),
              processingTime: new Date(currentTimeMS - 5000).toISOString(),
              messageRaw: segmentIdentifyEvent({
                userId: userId1,
                timestamp: new Date(currentTimeMS - 10000).toISOString(),
                traits: {
                  plan: "paid",
                },
              }),
            },
          ],
        });
      });

      it("only sends messages while the journey is running", async () => {
        const computePropertiesWorkflowId = `segments-notification-workflow-${randomUUID()}`;
        let workerError: Error | null = null;

        await worker.runUntil(async () => {
          try {
            let computedPropertiesParams: ComputedPropertiesWorkflowParams =
              await testEnv.client.workflow.execute(computePropertiesWorkflow, {
                workflowId: computePropertiesWorkflowId,
                taskQueue: "default",
                args: [
                  {
                    tableVersion,
                    workspaceId: workspace.id,
                    maxPollingAttempts: 1,
                    shouldContinueAsNew: false,
                  },
                ],
              });

            const handle = testEnv.client.workflow.getHandle(
              userJourneyWorkflowId
            );

            let workflowDescribeError: unknown | null = null;
            try {
              await handle.describe();
            } catch (e) {
              workflowDescribeError = e;
            }
            expect(workflowDescribeError).toBeInstanceOf(WorkflowNotFoundError);
            expect(testActivities.sendEmail).toHaveBeenCalledTimes(0);

            await prisma().journey.update({
              where: {
                id: journey.id,
              },
              data: {
                status: "Running",
              },
            });

            computedPropertiesParams = await testEnv.client.workflow.execute(
              computePropertiesWorkflow,
              {
                workflowId: computePropertiesWorkflowId,
                taskQueue: "default",
                args: [
                  {
                    ...computedPropertiesParams,
                    maxPollingAttempts: 1,
                    shouldContinueAsNew: false,
                  },
                ],
              }
            );

            expect(testActivities.sendEmail).toHaveBeenCalledTimes(1);
            expect(testActivities.sendEmail).toHaveBeenCalledWith(
              expect.objectContaining({
                userId: userId1,
              })
            );

            const currentTimeMS = await testEnv.currentTimeMs();

            await Promise.all([
              prisma().journey.update({
                where: {
                  id: journey.id,
                },
                data: {
                  status: "Paused",
                },
              }),

              insertUserEvents({
                tableVersion,
                workspaceId: workspace.id,
                events: [
                  {
                    messageId: randomUUID(),
                    processingTime: new Date(
                      currentTimeMS - 5000
                    ).toISOString(),
                    messageRaw: segmentIdentifyEvent({
                      userId: userId2,
                      timestamp: new Date(currentTimeMS - 10000).toISOString(),
                      traits: {
                        plan: "paid",
                      },
                    }),
                  },
                ],
              }),
            ]);

            computedPropertiesParams = await testEnv.client.workflow.execute(
              computePropertiesWorkflow,
              {
                workflowId: computePropertiesWorkflowId,
                taskQueue: "default",
                args: [
                  {
                    ...computedPropertiesParams,
                    maxPollingAttempts: 1,
                    shouldContinueAsNew: false,
                  },
                ],
              }
            );

            expect(testActivities.sendEmail).toHaveBeenCalledTimes(1);
            expect(testActivities.sendEmail).not.toHaveBeenCalledWith(
              expect.objectContaining({
                userId: userId2,
              })
            );

            await prisma().journey.update({
              where: {
                id: journey.id,
              },
              data: {
                status: "Running",
              },
            });

            await testEnv.client.workflow.execute(computePropertiesWorkflow, {
              workflowId: computePropertiesWorkflowId,
              taskQueue: "default",
              args: [
                {
                  ...computedPropertiesParams,
                  maxPollingAttempts: 1,
                  shouldContinueAsNew: false,
                },
              ],
            });

            expect(testActivities.sendEmail).toHaveBeenCalledTimes(2);
            expect(testActivities.sendEmail).toHaveBeenCalledWith(
              expect.objectContaining({
                userId: userId2,
              })
            );
          } catch (e) {
            workerError = e as Error;
          }
        });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (workerError !== null) {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw workerError;
        }
      });
    });
  });
});
