import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ok } from "neverthrow";

import { createWorker } from "../../test/temporal";
import { insert } from "../db";
import { journey as dbJourney, segment as dbSegment } from "../db/schema";
import { insertSegmentAssignments } from "../segments";
import {
  ChannelType,
  EmailProviderType,
  InternalEventType,
  Journey,
  JourneyDefinition,
  JourneyNodeType,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentUpdate,
  TraitSegmentNode,
  Workspace,
} from "../types";
import { createWorkspace } from "../workspaces";
import {
  segmentUpdateSignal,
  userJourneyWorkflow,
  UserJourneyWorkflowVersion,
} from "./userWorkflow";
import { sendMessageFactory } from "./userWorkflow/activities";

jest.setTimeout(15000);

describe("journeys with wait-for nodes", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;
  let workerRunPromise: Promise<void>;
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

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
    worker = await createWorker({
      testEnv,
      activityOverrides: testActivities,
    });
    workerRunPromise = worker.run();
  });

  afterAll(async () => {
    worker.shutdown();
    await workerRunPromise;
    await testEnv.teardown();
  });

  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        name: `event-entry-${randomUUID()}`,
      }),
    );
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
        insert({
          table: dbJourney,
          values: {
            id: randomUUID(),
            name: "wait-for-test",
            definition: journeyDefinition,
            workspaceId: workspace.id,
            updatedAt: new Date(),
            status: "Running",
          },
        }).then(unwrap),
        insert({
          table: dbSegment,
          values: {
            id: entrySegmentId,
            name: "entry-segment",
            definition: entrySegmentDefinition,
            workspaceId: workspace.id,
            updatedAt: new Date(),
          },
        }),
        insert({
          table: dbSegment,
          values: {
            id: waitForSegmentId,
            name: "wait-for-segment",
            definition: waitForSegmentDefinition,
            workspaceId: workspace.id,
            updatedAt: new Date(),
          },
        }).then(unwrap),
      ]);
      await insertSegmentAssignments([
        {
          workspaceId: workspace.id,
          segmentId: entrySegmentId,
          userId: userId1,
          inSegment: true,
        },
        {
          workspaceId: workspace.id,
          segmentId: waitForSegmentId,
          userId: userId2,
          inSegment: false,
        },
        {
          workspaceId: workspace.id,
          segmentId: waitForSegmentId,
          userId: userId1,
          inSegment: true,
        },
      ]);
    });

    it("they should satisfy the wait-for condition", async () => {
      const handle1 = await testEnv.client.workflow.signalWithStart(
        userJourneyWorkflow,
        {
          workflowId: `workflow1-${randomUUID()}`,
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
          workflowId: `workflow2-${randomUUID()}`,
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
