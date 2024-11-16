import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { ok } from "neverthrow";

import { createEnvAndWorker } from "../../test/temporal";
import prisma from "../prisma";
import {
  ChannelType,
  CursorDirectionEnum,
  DelayVariantType,
  EmailProviderType,
  InternalEventType,
  Journey,
  JourneyDefinition,
  JourneyNodeType,
  KeyedPerformedSegmentNode,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentSplitNode,
  SegmentSplitVariantType,
  TraitSegmentNode,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyDelayVariant,
  UserPropertyOperatorType,
  Workspace,
} from "../types";
import {
  trackSignal,
  userJourneyWorkflow,
  UserJourneyWorkflowVersion,
} from "./userWorkflow";
import { sendMessageFactory } from "./userWorkflow/activities";

describe("journeys with wait-for nodes", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;
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
          messageId: "test",
        },
      },
    }),
  );

  const testActivities = {
    sendMessageV2: sendMessageFactory(senderMock),
  };

  beforeEach(async () => {
    workspace = await prisma().workspace.create({
      data: {
        name: `event-entry-${randomUUID()}`,
      },
    });

    const envAndWorker = await createEnvAndWorker({
      activityOverrides: testActivities,
    });
    testEnv = envAndWorker.testEnv;
    worker = envAndWorker.worker;
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  describe("when a journey has a wait-for node", () => {
    let journey: Journey;
    let journeyDefinition: JourneyDefinition;
    const oneDaySeconds = 60 * 60 * 24;

    beforeEach(async () => {
      const entrySegmentId = randomUUID();
      const waitForSegmentId = randomUUID();
      const templateId = randomUUID();

      journeyDefinition = {
        entryNode: {
          type: JourneyNodeType.SegmentEntryNode,
          segment: entrySegmentId,
          child: "wait-for",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.WaitForNode,
            id: "wait-for",
            timeoutSeconds: oneDaySeconds,
            timeoutChild: JourneyNodeType.ExitNode,
            segmentChildren: [
              {
                id: "send-message",
                segmentId: waitForSegmentId,
              },
            ],
          },
          {
            type: JourneyNodeType.MessageNode,
            id: "send-message",
            variant: {
              type: ChannelType.Email,
              templateId,
            },
            child: JourneyNodeType.ExitNode,
          },
        ],
      };
      const entrySegmentDefinition: SegmentDefinition = {
        entryNode: {
          type: SegmentNodeType.Trait,
          id: "entry-segment",
          path: "trait1",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "value1",
          },
        } satisfies TraitSegmentNode,
        nodes: [],
      };
      const waitForSegmentDefinition: SegmentDefinition = {
        entryNode: {
          type: SegmentNodeType.Trait,
          id: waitForSegmentId,
          path: "trait2",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "value2",
          },
        },
        nodes: [],
      };

      [journey] = await Promise.all([
        prisma().journey.create({
          data: {
            name: "wait-for-test",
            definition: journeyDefinition,
            workspaceId: workspace.id,
            status: "Running",
          },
        }),
        prisma().segment.create({
          data: {
            id: entrySegmentId,
            name: "entry-segment",
            definition: entrySegmentDefinition,
            workspaceId: workspace.id,
          },
        }),
        prisma().segment.create({
          data: {
            id: waitForSegmentId,
            name: "wait-for-segment",
            definition: waitForSegmentDefinition,
            workspaceId: workspace.id,
          },
        }),
      ]);
    });
    describe("when a journey a user already is in the segment being waited for, and when they satisfy the wait-for condition after entering they should also be sent to the message node", () => {
      let userId1: string;
      let userId2: string;

      beforeEach(() => {
        userId1 = randomUUID();
        userId2 = randomUUID();
      });

      it("they should satisfy the wait-for condition", async () => {
        await worker.runUntil(async () => {
          const handle1 = await testEnv.client.workflow.start(
            userJourneyWorkflow,
            {
              workflowId: "workflow1",
              taskQueue: "default",
              args: [
                {
                  journeyId: journey.id,
                  workspaceId: workspace.id,
                  userId: userId1,
                  definition: journeyDefinition,
                  version: UserJourneyWorkflowVersion.V2,
                },
              ],
            },
          );

          const handle2 = await testEnv.client.workflow.start(
            userJourneyWorkflow,
            {
              workflowId: "workflow2",
              taskQueue: "default",
              args: [
                {
                  journeyId: journey.id,
                  workspaceId: workspace.id,
                  userId: userId2,
                  definition: journeyDefinition,
                  version: UserJourneyWorkflowVersion.V2,
                },
              ],
            },
          );
          await Promise.all([handle1.result(), handle2.result()]);
        });
      });
    });
  });
});
