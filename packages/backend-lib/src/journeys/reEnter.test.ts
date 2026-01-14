/**
 * @group temporal
 */
import { WorkflowFailedError } from "@temporalio/client";
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
  JourneyResourceStatusEnum,
  Segment,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  Workspace,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "../types";
import { createWorkspace } from "../workspaces";
import {
  segmentUpdateSignal,
  userJourneyWorkflow,
  UserJourneyWorkflowVersion,
} from "./userWorkflow";
import { sendMessageFactory } from "./userWorkflow/activities";

jest.setTimeout(30000);

describe("reEnter", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment | null = null;
  let worker: Worker | null = null;
  let workerRunPromise: Promise<void> | null = null;

  function getTestEnv(): TestWorkflowEnvironment {
    if (!testEnv) throw new Error("testEnv not initialized");
    return testEnv;
  }

  let journeyDefinition: JourneyDefinition;
  let journey: Journey;
  let segment: Segment;
  const userId = "user1";

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
    if (worker) {
      worker.shutdown();
    }
    if (workerRunPromise) {
      await workerRunPromise;
    }
    if (testEnv) {
      await testEnv.teardown();
    }
  });

  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        name: `event-entry-${randomUUID()}`,
        status: WorkspaceStatusDbEnum.Active,
        type: WorkspaceTypeAppEnum.Root,
      }),
    );

    segment = await insert({
      table: dbSegment,
      values: {
        id: randomUUID(),
        name: `segment1`,
        workspaceId: workspace.id,
        definition: {
          entryNode: {
            id: randomUUID(),
            type: SegmentNodeType.Trait,
            path: "path",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "value1",
            },
          },
          nodes: [],
        } satisfies SegmentDefinition,
      },
    }).then(unwrap);
  });

  describe("when canRunMultiple is true and the journey is run twice", () => {
    beforeEach(async () => {
      journeyDefinition = {
        entryNode: {
          type: JourneyNodeType.SegmentEntryNode,
          segment: segment.id,
          child: "message-node",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.MessageNode,
            id: "message-node",
            variant: {
              type: ChannelType.Email,
              templateId: "test",
            },
            child: JourneyNodeType.ExitNode,
          },
        ],
      };
      await insertSegmentAssignments([
        {
          workspaceId: workspace.id,
          userId,
          segmentId: segment.id,
          inSegment: true,
        },
      ]);
      journey = await insert({
        table: dbJourney,
        values: {
          id: randomUUID(),
          name: `re-enter-${randomUUID()}`,
          definition: journeyDefinition,
          workspaceId: workspace.id,
          canRunMultiple: true,
          status: JourneyResourceStatusEnum.Running,
        },
      }).then(unwrap);
    });

    it("should run the journey twice to completion", async () => {
      const handle1 = await getTestEnv().client.workflow.signalWithStart(
        userJourneyWorkflow,
        {
          workflowId: `workflow1-${randomUUID()}`,
          taskQueue: "default",
          signal: segmentUpdateSignal,
          signalArgs: [
            {
              segmentId: segment.id,
              currentlyInSegment: true,
              type: "segment",
              segmentVersion: await getTestEnv().currentTimeMs(),
            },
          ],
          args: [
            {
              journeyId: journey.id,
              workspaceId: workspace.id,
              userId,
              definition: journeyDefinition,
              version: UserJourneyWorkflowVersion.V2,
            },
          ],
        },
      );

      await handle1.result();

      expect(senderMock).toHaveBeenCalledTimes(1);

      const handle2 = await getTestEnv().client.workflow.signalWithStart(
        userJourneyWorkflow,
        {
          workflowId: `workflow2-${randomUUID()}`,
          taskQueue: "default",
          signal: segmentUpdateSignal,
          signalArgs: [
            {
              segmentId: segment.id,
              currentlyInSegment: true,
              type: "segment",
              segmentVersion: await getTestEnv().currentTimeMs(),
            },
          ],
          args: [
            {
              journeyId: journey.id,
              workspaceId: workspace.id,
              userId,
              definition: journeyDefinition,
              version: UserJourneyWorkflowVersion.V2,
            },
          ],
        },
      );

      await handle2.result();

      expect(senderMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("when canRunMultiple is false and the journey is run twice", () => {
    beforeEach(async () => {
      journeyDefinition = {
        entryNode: {
          type: JourneyNodeType.SegmentEntryNode,
          segment: segment.id,
          child: "message-node",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.MessageNode,
            id: "message-node",
            variant: {
              type: ChannelType.Email,
              templateId: "test",
            },
            child: JourneyNodeType.ExitNode,
          },
        ],
      };
      await insertSegmentAssignments([
        {
          workspaceId: workspace.id,
          userId,
          segmentId: segment.id,
          inSegment: true,
        },
      ]);
      journey = await insert({
        table: dbJourney,
        values: {
          id: randomUUID(),
          name: `re-enter-${randomUUID()}`,
          definition: journeyDefinition,
          workspaceId: workspace.id,
          canRunMultiple: false,
          status: JourneyResourceStatusEnum.Running,
        },
      }).then(unwrap);
    });
    it("should run the journey once to completion", async () => {
      const handle1 = await getTestEnv().client.workflow.signalWithStart(
        userJourneyWorkflow,
        {
          workflowId: `workflow1-${randomUUID()}`,
          taskQueue: "default",
          signal: segmentUpdateSignal,
          signalArgs: [
            {
              segmentId: segment.id,
              currentlyInSegment: true,
              type: "segment",
              segmentVersion: await getTestEnv().currentTimeMs(),
            },
          ],
          args: [
            {
              journeyId: journey.id,
              workspaceId: workspace.id,
              userId,
              definition: journeyDefinition,
              version: UserJourneyWorkflowVersion.V2,
            },
          ],
        },
      );

      await handle1.result();

      expect(senderMock).toHaveBeenCalledTimes(1);

      const handle2 = await getTestEnv().client.workflow.signalWithStart(
        userJourneyWorkflow,
        {
          workflowId: `workflow2-${randomUUID()}`,
          taskQueue: "default",
          signal: segmentUpdateSignal,
          signalArgs: [
            {
              segmentId: segment.id,
              currentlyInSegment: true,
              type: "segment",
              segmentVersion: await getTestEnv().currentTimeMs(),
            },
          ],
          args: [
            {
              journeyId: journey.id,
              workspaceId: workspace.id,
              userId,
              definition: journeyDefinition,
              version: UserJourneyWorkflowVersion.V2,
            },
          ],
        },
      );

      await handle2.result();

      expect(senderMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("when canRunMultiple is true and it is configured to re-enter", () => {
    beforeEach(async () => {
      journeyDefinition = {
        entryNode: {
          type: JourneyNodeType.SegmentEntryNode,
          segment: segment.id,
          child: "message-node",
          reEnter: true,
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.MessageNode,
            id: "message-node",
            variant: {
              type: ChannelType.Email,
              templateId: "test",
            },
            child: JourneyNodeType.ExitNode,
          },
        ],
      };
      await insertSegmentAssignments([
        {
          workspaceId: workspace.id,
          userId,
          segmentId: segment.id,
          inSegment: true,
        },
      ]);
      journey = await insert({
        table: dbJourney,
        values: {
          id: randomUUID(),
          name: `re-enter-${randomUUID()}`,
          definition: journeyDefinition,
          workspaceId: workspace.id,
          canRunMultiple: true,
          status: JourneyResourceStatusEnum.Running,
        },
      }).then(unwrap);
    });
    describe("when the user is in the segment", () => {
      beforeEach(async () => {
        await insertSegmentAssignments([
          {
            workspaceId: workspace.id,
            userId,
            segmentId: segment.id,
            inSegment: true,
          },
        ]);
      });
      it("should run to completion and continue as new", async () => {
        const handle = await getTestEnv().client.workflow.signalWithStart(
          userJourneyWorkflow,
          {
            workflowId: `workflow1-${randomUUID()}`,
            taskQueue: "default",
            signal: segmentUpdateSignal,
            signalArgs: [
              {
                segmentId: segment.id,
                currentlyInSegment: true,
                type: "segment",
                segmentVersion: await getTestEnv().currentTimeMs(),
              },
            ],
            args: [
              {
                journeyId: journey.id,
                workspaceId: workspace.id,
                userId,
                definition: journeyDefinition,
                version: UserJourneyWorkflowVersion.V2,
                shouldContinueAsNew: false,
              },
            ],
          },
        );

        const nextProps = await handle.result();
        expect(nextProps).not.toBeNull();
      });
      it("should run to completion on second run", async () => {
        await getTestEnv().client.workflow.execute(userJourneyWorkflow, {
          workflowId: `workflow1-${randomUUID()}`,
          taskQueue: "default",
          args: [
            {
              journeyId: journey.id,
              workspaceId: workspace.id,
              userId,
              definition: journeyDefinition,
              version: UserJourneyWorkflowVersion.V2,
              shouldContinueAsNew: false,
            },
          ],
        });
        expect(senderMock).toHaveBeenCalledTimes(1);
      });
    });
    describe("when the user is not in the segment", () => {
      beforeEach(async () => {
        await insertSegmentAssignments([
          {
            workspaceId: workspace.id,
            userId,
            segmentId: segment.id,
            inSegment: false,
          },
        ]);
      });
      it("should run to completion and not continue as new", async () => {
        const handle = await getTestEnv().client.workflow.signalWithStart(
          userJourneyWorkflow,
          {
            workflowId: `workflow1-${randomUUID()}`,
            taskQueue: "default",
            signal: segmentUpdateSignal,
            signalArgs: [
              {
                segmentId: segment.id,
                currentlyInSegment: true,
                type: "segment",
                segmentVersion: await getTestEnv().currentTimeMs(),
              },
            ],
            args: [
              {
                journeyId: journey.id,
                workspaceId: workspace.id,
                userId,
                definition: journeyDefinition,
                version: UserJourneyWorkflowVersion.V2,
                shouldContinueAsNew: false,
              },
            ],
          },
        );

        const nextProps = await handle.result();
        expect(nextProps).toBeNull();
      });

      it("should not run to completion on second run", async () => {
        let err: unknown;
        const handle = await getTestEnv().client.workflow.start(
          userJourneyWorkflow,
          {
            workflowId: `workflow1-${randomUUID()}`,
            taskQueue: "default",
            args: [
              {
                journeyId: journey.id,
                workspaceId: workspace.id,
                userId,
                definition: journeyDefinition,
                version: UserJourneyWorkflowVersion.V2,
                shouldContinueAsNew: false,
              },
            ],
          },
        );
        try {
          await handle.result();
        } catch (e) {
          err = e;
        }
        expect(err).toBeInstanceOf(WorkflowFailedError);
        if (err instanceof WorkflowFailedError) {
          expect(err.message).toContain("timed out");
        }
      });
    });
  });
});
