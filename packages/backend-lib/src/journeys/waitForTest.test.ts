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
  SegmentUpdate,
  TraitSegmentNode,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyDelayVariant,
  UserPropertyOperatorType,
  Workspace,
} from "../types";
import {
  segmentUpdateSignal,
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

  describe("when a journey a user already is in the segment being waited for, and when they satisfy the wait-for condition after entering they should also be sent to the message node", () => {
    let journey: Journey;
    let journeyDefinition: JourneyDefinition;
    let userId1: string;
    let userId2: string;
    let waitForSegmentId: string;
    let entrySegmentId: string;
    const oneDaySeconds = 60 * 60 * 24;

    beforeEach(async () => {
      userId1 = randomUUID();
      userId2 = randomUUID();
      entrySegmentId = randomUUID();
      waitForSegmentId = randomUUID();
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
      await Promise.all([
        prisma().segmentAssignment.create({
          data: {
            workspaceId: workspace.id,
            segmentId: entrySegmentId,
            userId: userId1,
            inSegment: true,
          },
        }),
        prisma().segmentAssignment.create({
          data: {
            workspaceId: workspace.id,
            segmentId: waitForSegmentId,
            userId: userId2,
            inSegment: false,
          },
        }),
        prisma().segmentAssignment.create({
          data: {
            workspaceId: workspace.id,
            segmentId: waitForSegmentId,
            userId: userId1,
            inSegment: true,
          },
        }),
      ]);
    });

    it("they should satisfy the wait-for condition", async () => {
      await worker.runUntil(async () => {
        const handle1 = await testEnv.client.workflow.signalWithStart(
          userJourneyWorkflow,
          {
            workflowId: "workflow1",
            taskQueue: "default",
            signal: segmentUpdateSignal,
            signalArgs: [
              {
                segmentId: entrySegmentId,
                currentlyInSegment: true,
                type: "segment",
                segmentVersion: await testEnv.currentTimeMs(),
              },
            ],
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

        await handle1.result();

        expect(
          senderMock,
          "should have sent a message to user 1 given that they initially satisfied the wait-for condition",
        ).toHaveBeenCalledTimes(1);

        const handle2 = await testEnv.client.workflow.signalWithStart(
          userJourneyWorkflow,
          {
            workflowId: "workflow2",
            taskQueue: "default",
            signal: segmentUpdateSignal,
            signalArgs: [
              {
                segmentId: entrySegmentId,
                currentlyInSegment: true,
                type: "segment",
                segmentVersion: await testEnv.currentTimeMs(),
              },
            ],
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

        await handle2.signal(segmentUpdateSignal, {
          segmentId: waitForSegmentId,
          currentlyInSegment: true,
          type: "segment",
          segmentVersion: await testEnv.currentTimeMs(),
        } satisfies SegmentUpdate);

        await handle2.result();
        expect(
          senderMock,
          "should have sent a message to user 2 given that they satisfied the wait-for condition after entering",
        ).toHaveBeenCalledTimes(2);
      });
    });
  });
});
