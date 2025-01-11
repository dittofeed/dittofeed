import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { WorkflowNotFoundError } from "@temporalio/workflow";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { createEnvAndWorker } from "../../test/temporal";
import { submitBatch } from "../../test/testEvents";
import { clickhouseClient } from "../clickhouse";
import {
  ComputedPropertiesWorkflowParams,
  computePropertiesWorkflow,
} from "../computedProperties/computePropertiesWorkflow";
import config from "../config";
import { FEATURE_INCREMENTAL_COMP } from "../constants";
import { db, insert } from "../db";
import {
  feature as dbFeature,
  journey as dbJourney,
  segment as dbSegment,
} from "../db/schema";
import { enrichJourney } from "../journeys";
import logger from "../logger";
import { upsertSubscriptionGroup } from "../subscriptionGroups";
import {
  ChannelType,
  DelayVariantType,
  EnrichedJourney,
  EventType,
  JourneyDefinition,
  JourneyNodeType,
  Segment,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentSplitVariantType,
  SubscriptionGroupType,
  Workspace,
} from "../types";
import { createWorkspace } from "../workspaces";
import { getUserJourneyWorkflowId } from "./userWorkflow";

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

jest.setTimeout(30000);

describe("end to end journeys", () => {
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  const testActivities = {
    sendMessageV2: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    try {
      logger().info("creating test env and worker");
      const envAndWorker = await createEnvAndWorker({
        activityOverrides: testActivities,
      });
      logger().info("created test env and worker");
      testEnv = envAndWorker.testEnv;
      worker = envAndWorker.worker;
    } catch (e) {
      logger().error(
        {
          err: e,
        },
        "error creating test env and worker",
      );
      throw e;
    }
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  afterAll(async () => {
    await clickhouseClient().close();
  });

  describe("wait for journey", () => {
    let journey: EnrichedJourney;
    let workspace: Workspace;
    let userId1: string;
    let userJourneyWorkflowId: string;
    let currentTimeMS: number;
    let waitForNode1: string;
    let messageNode1: string;
    let messageNode2: string;
    beforeEach(async () => {
      workspace = await createWorkspace({
        id: randomUUID(),
        name: `workspace-${randomUUID()}`,
        updatedAt: new Date(),
      }).then(unwrap);

      await db().insert(dbFeature).values({
        workspaceId: workspace.id,
        name: FEATURE_INCREMENTAL_COMP,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      userId1 = `user1-${randomUUID()}`;

      const segmentDefinition1: SegmentDefinition = {
        entryNode: {
          type: SegmentNodeType.Trait,
          id: randomUUID(),
          path: "onboardingState",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "step1",
          },
        },
        nodes: [],
      };

      const segment1 = await insert({
        table: dbSegment,
        values: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: randomUUID(),
          definition: segmentDefinition1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }).then(unwrap);

      const segmentDefinition2: SegmentDefinition = {
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
      const segment2 = await insert({
        table: dbSegment,
        values: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: randomUUID(),
          definition: segmentDefinition2,
          updatedAt: new Date(),
        },
      }).then(unwrap);

      waitForNode1 = "waitForNode1";
      messageNode1 = "messageNode1";
      messageNode2 = "messageNode2";

      const journeyDefinition: JourneyDefinition = {
        entryNode: {
          type: JourneyNodeType.SegmentEntryNode,
          segment: segment1.id,
          child: waitForNode1,
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.WaitForNode,
            id: waitForNode1,
            timeoutChild: messageNode1,
            timeoutSeconds: 60 * 60 * 24,
            segmentChildren: [
              {
                id: messageNode2,
                segmentId: segment2.id,
              },
            ],
          },
          {
            type: JourneyNodeType.MessageNode,
            id: messageNode1,
            child: JourneyNodeType.ExitNode,
            variant: {
              type: ChannelType.Email,
              templateId: randomUUID(),
            },
          },
          {
            type: JourneyNodeType.MessageNode,
            id: messageNode2,
            child: JourneyNodeType.ExitNode,
            variant: {
              type: ChannelType.Email,
              templateId: randomUUID(),
            },
          },
        ],
      };

      journey = unwrap(
        (
          await insert({
            table: dbJourney,
            values: {
              id: randomUUID(),
              name: `user-journey-${randomUUID()}`,
              workspaceId: workspace.id,
              definition: journeyDefinition,
              status: "Running",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          })
        ).andThen(enrichJourney),
      );

      currentTimeMS = await testEnv.currentTimeMs();

      userJourneyWorkflowId = getUserJourneyWorkflowId({
        userId: userId1,
        journeyId: journey.id,
      });
    });

    describe("when the timer times out before the segment is satisfied", () => {
      it("sends them an email from the timeout branch", async () => {
        await submitBatch({
          workspaceId: workspace.id,
          now: currentTimeMS,
          data: [
            {
              userId: userId1,
              type: EventType.Identify,
              processingOffsetMs: -5000,
              offsetMs: -10000,
              traits: {
                onboardingState: "step1",
              },
            },
          ],
        });
        const segmentWorkflow1 = `segments-notification-workflow-${randomUUID()}`;

        await worker.runUntil(async () => {
          await testEnv.client.workflow.start(computePropertiesWorkflow, {
            workflowId: segmentWorkflow1,
            taskQueue: "default",
            args: [
              {
                tableVersion: config().defaultUserEventsTableVersion,
                workspaceId: workspace.id,
                // poll multiple times to ensure we get segment update
                maxPollingAttempts: 10,
                shouldContinueAsNew: false,
              },
            ],
          });

          const segmentWorkflowHandle =
            testEnv.client.workflow.getHandle(segmentWorkflow1);

          // waiting past 1 day timeout
          await testEnv.sleep("1 week");

          await submitBatch({
            workspaceId: workspace.id,
            now: currentTimeMS,
            data: [
              {
                userId: userId1,
                type: EventType.Identify,
                processingOffsetMs: -1000,
                offsetMs: -6000,
                traits: {
                  plan: "paid",
                },
              },
            ],
          });

          await segmentWorkflowHandle.result();

          const handle = testEnv.client.workflow.getHandle(
            userJourneyWorkflowId,
          );

          await handle.result();
        });

        expect(testActivities.sendMessageV2).toHaveBeenCalledTimes(1);
        expect(testActivities.sendMessageV2).toHaveBeenCalledWith(
          expect.objectContaining({
            nodeId: messageNode1,
          }),
        );
      });
    });

    describe("when the user satisfied the wait for before entering the node", () => {
      it("sends them an email from the segment branch", async () => {
        const segmentWorkflow1 = `segments-notification-workflow-${randomUUID()}`;

        await submitBatch({
          workspaceId: workspace.id,
          now: currentTimeMS,
          data: [
            {
              userId: userId1,
              type: EventType.Identify,
              processingOffsetMs: -1000,
              offsetMs: -6000,
              traits: {
                plan: "paid",
              },
            },
          ],
        });

        await worker.runUntil(async () => {
          // recompute properties once
          await testEnv.client.workflow.start(computePropertiesWorkflow, {
            workflowId: segmentWorkflow1,
            taskQueue: "default",
            args: [
              {
                tableVersion: config().defaultUserEventsTableVersion,
                workspaceId: workspace.id,
                maxPollingAttempts: 2,
                shouldContinueAsNew: false,
              },
            ],
          });

          const segmentWorkflowHandle =
            testEnv.client.workflow.getHandle(segmentWorkflow1);

          // submit event to satisfy segment and trigger wait for journey node
          await submitBatch({
            workspaceId: workspace.id,
            now: currentTimeMS,
            data: [
              {
                userId: userId1,
                type: EventType.Identify,
                processingOffsetMs: -5000,
                offsetMs: -10000,
                traits: {
                  onboardingState: "step1",
                },
              },
            ],
          });

          // wait for polling period sleep to finish, allowing recompute workflow to run a second time
          await testEnv.sleep(45000);

          await segmentWorkflowHandle.result();

          const handle = testEnv.client.workflow.getHandle(
            userJourneyWorkflowId,
          );

          await handle.result();
        });

        expect(testActivities.sendMessageV2).toHaveBeenCalledTimes(1);
        expect(testActivities.sendMessageV2).toHaveBeenCalledWith(
          expect.objectContaining({
            nodeId: messageNode2,
          }),
        );
      });
    });

    describe("when the user satisfies the wait for before the timeout", () => {
      it("sends them an email from the segment branch", async () => {
        await submitBatch({
          workspaceId: workspace.id,
          now: currentTimeMS,
          data: [
            {
              userId: userId1,
              type: EventType.Identify,
              processingOffsetMs: -5000,
              offsetMs: -10000,
              traits: {
                onboardingState: "step1",
              },
            },
          ],
        });

        const segmentWorkflow1 = `segments-notification-workflow-${randomUUID()}`;

        await worker.runUntil(async () => {
          await testEnv.client.workflow.start(computePropertiesWorkflow, {
            workflowId: segmentWorkflow1,
            taskQueue: "default",
            args: [
              {
                tableVersion: config().defaultUserEventsTableVersion,
                workspaceId: workspace.id,
                // poll multiple times to ensure we get segment update
                maxPollingAttempts: 2,
                shouldContinueAsNew: false,
              },
            ],
          });

          const segmentWorkflowHandle =
            testEnv.client.workflow.getHandle(segmentWorkflow1);

          await submitBatch({
            workspaceId: workspace.id,
            now: currentTimeMS,
            data: [
              {
                userId: userId1,
                type: EventType.Identify,
                processingOffsetMs: -1000,
                offsetMs: -6000,
                traits: {
                  plan: "paid",
                },
              },
            ],
          });

          await testEnv.sleep(45000);

          await segmentWorkflowHandle.result();

          const handle = testEnv.client.workflow.getHandle(
            userJourneyWorkflowId,
          );

          await handle.result();
        });

        expect(testActivities.sendMessageV2).toHaveBeenCalledTimes(1);
        expect(testActivities.sendMessageV2).toHaveBeenCalledWith(
          expect.objectContaining({
            nodeId: messageNode2,
          }),
        );
      });
    });
  });

  describe("onboarding journey", () => {
    let journey: EnrichedJourney;
    let workspace: Workspace;
    let userId1: string;
    let userId2: string;
    let userJourneyWorkflowId: string;

    beforeEach(async () => {
      workspace = await createWorkspace({
        name: `workspace-${randomUUID()}`,
        id: randomUUID(),
        updatedAt: new Date(),
      }).then(unwrap);

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

        recentlyCreatedSegment = await insert({
          table: dbSegment,
          values: {
            id: randomUUID(),
            name: `recently-created-${randomUUID()}`,
            workspaceId: workspace.id,
            definition: recentlyCreatedSegmentDefinition,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }).then(unwrap);

        paidAccountSegment = await insert({
          table: dbSegment,
          values: {
            id: randomUUID(),
            workspaceId: workspace.id,
            name: `paid-${randomUUID()}`,
            definition: paidSegmentDefinition,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }).then(unwrap);

        const nodeId1 = randomUUID();
        const nodeId2 = randomUUID();
        const nodeId3 = randomUUID();

        const journeyDefinition: JourneyDefinition = {
          entryNode: {
            type: JourneyNodeType.SegmentEntryNode,
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
            await insert({
              table: dbJourney,
              values: {
                id: randomUUID(),
                name: `user-journey-${randomUUID()}`,
                workspaceId: workspace.id,
                definition: journeyDefinition,
                status: "Running",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            }).then(unwrap),
          ),
        );

        const currentTimeMS = await testEnv.currentTimeMs();

        await submitBatch({
          workspaceId: workspace.id,
          now: currentTimeMS,
          data: [
            {
              userId: userId1,
              type: EventType.Identify,
              processingOffsetMs: -5000,
              offsetMs: -10000,
              traits: {
                plan: "free",
                createdAt: new Date(currentTimeMS - 15000).toISOString(),
              },
            },
            {
              userId: userId2,
              type: EventType.Identify,
              processingOffsetMs: -5000,
              offsetMs: -10000,
              traits: {
                plan: "paid",
                createdAt: new Date(currentTimeMS - 15000).toISOString(),
              },
            },
          ],
        });

        userJourneyWorkflowId = getUserJourneyWorkflowId({
          userId: userId1,
          journeyId: journey.id,
        });
      });

      it("sends them a welcome email", async () => {
        const segmentWorkflow1 = `segments-notification-workflow-${randomUUID()}`;

        await worker.runUntil(async () => {
          await testEnv.client.workflow.start(computePropertiesWorkflow, {
            workflowId: segmentWorkflow1,
            taskQueue: "default",
            args: [
              {
                tableVersion: config().defaultUserEventsTableVersion,
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
            userJourneyWorkflowId,
          );

          const userJourneyWorkflowId2 = getUserJourneyWorkflowId({
            userId: userId2,
            journeyId: journey.id,
          });

          const handle2 = testEnv.client.workflow.getHandle(
            userJourneyWorkflowId2,
          );

          await Promise.all([handle.result(), handle2.result()]);
        });

        expect(testActivities.sendMessageV2).toHaveBeenCalledTimes(1);
      });
    });

    describe("when a journey goes through status transitions", () => {
      let paidAccountSegment: Segment;

      beforeEach(async () => {
        paidAccountSegment = await insert({
          table: dbSegment,
          values: {
            id: randomUUID(),
            workspaceId: workspace.id,
            name: `paid-${randomUUID()}`,
            definition: paidSegmentDefinition,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }).then(unwrap);

        const nodeId1 = randomUUID();

        const subscriptionGroup = unwrap(
          await upsertSubscriptionGroup({
            id: randomUUID(),
            workspaceId: workspace.id,
            name: "default",
            type: SubscriptionGroupType.OptIn,
            channel: ChannelType.Email,
          }),
        );

        const journeyDefinition: JourneyDefinition = {
          entryNode: {
            type: JourneyNodeType.SegmentEntryNode,
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

        journey = await insert({
          table: dbJourney,
          values: {
            id: randomUUID(),
            name: `user-journey-${randomUUID()}`,
            workspaceId: workspace.id,
            definition: journeyDefinition,
            status: "NotStarted",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        })
          .then((r) => r.andThen(enrichJourney))
          .then(unwrap);

        userJourneyWorkflowId = getUserJourneyWorkflowId({
          userId: userId1,
          journeyId: journey.id,
        });

        const currentTimeMS = await testEnv.currentTimeMs();

        await submitBatch({
          workspaceId: workspace.id,
          now: currentTimeMS,
          data: [
            {
              userId: userId1,
              type: EventType.Identify,
              processingOffsetMs: -5000,
              offsetMs: -10000,
              traits: {
                plan: "paid",
              },
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
                    tableVersion: config().defaultUserEventsTableVersion,
                    workspaceId: workspace.id,
                    maxPollingAttempts: 1,
                    shouldContinueAsNew: false,
                  },
                ],
              });

            const handle = testEnv.client.workflow.getHandle(
              userJourneyWorkflowId,
            );

            let workflowDescribeError: unknown | null = null;
            try {
              await handle.describe();
            } catch (e) {
              workflowDescribeError = e;
            }
            expect(workflowDescribeError).toBeInstanceOf(WorkflowNotFoundError);
            expect(testActivities.sendMessageV2).toHaveBeenCalledTimes(0);

            await db()
              .update(dbJourney)
              .set({
                status: "Running",
              })
              .where(eq(dbJourney.id, journey.id));

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
              },
            );

            expect(testActivities.sendMessageV2).toHaveBeenCalledTimes(1);
            expect(testActivities.sendMessageV2).toHaveBeenCalledWith(
              expect.objectContaining({
                userId: userId1,
              }),
            );

            const currentTimeMS = await testEnv.currentTimeMs();

            await Promise.all([
              db()
                .update(dbJourney)
                .set({
                  status: "Paused",
                })
                .where(eq(dbJourney.id, journey.id)),

              await submitBatch({
                workspaceId: workspace.id,
                now: currentTimeMS,
                data: [
                  {
                    userId: userId2,
                    type: EventType.Identify,
                    processingOffsetMs: -5000,
                    offsetMs: -10000,
                    traits: {
                      plan: "paid",
                    },
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
              },
            );

            expect(testActivities.sendMessageV2).toHaveBeenCalledTimes(1);
            expect(testActivities.sendMessageV2).not.toHaveBeenCalledWith(
              expect.objectContaining({
                userId: userId2,
              }),
            );

            await db()
              .update(dbJourney)
              .set({
                status: "Running",
              })
              .where(eq(dbJourney.id, journey.id));

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

            expect(testActivities.sendMessageV2).toHaveBeenCalledTimes(2);
            expect(testActivities.sendMessageV2).toHaveBeenCalledWith(
              expect.objectContaining({
                userId: userId2,
              }),
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
