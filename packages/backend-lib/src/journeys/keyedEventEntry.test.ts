import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { ok } from "neverthrow";

import { createEnvAndWorker } from "../../test/temporal";
import prisma from "../prisma";
import {
  ChannelType,
  EmailProviderType,
  InternalEventType,
  Journey,
  JourneyDefinition,
  JourneyNodeType,
  KeyedPerformedSegmentNode,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyOperatorType,
  Workspace,
} from "../types";
import {
  getUserJourneyWorkflowId,
  trackSignal,
  userJourneyWorkflow,
  UserJourneyWorkflowVersion,
} from "./userWorkflow";
import { sendMessageFactory } from "./userWorkflow/activities";

jest.setTimeout(15000);

describe("keyedEventEntry journeys", () => {
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
          type: EmailProviderType.Smtp,
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

  describe("when a journey is keyed on appointmentId and waits for a cancellation event before sending a message", () => {
    let journey: Journey;
    let journeyDefinition: JourneyDefinition;
    const oneDaySeconds = 60 * 60 * 24;

    beforeEach(async () => {
      const appointmentCancelledSegmentId = randomUUID();
      const templateId = randomUUID();
      const dateUserPropertyId = randomUUID();

      journeyDefinition = {
        entryNode: {
          type: JourneyNodeType.EventEntryNode,
          event: "APPOINTMENT_UPDATE",
          key: "appointmentId",
          child: "wait-for-cancellation",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.WaitForNode,
            id: "wait-for-cancellation",
            timeoutSeconds: oneDaySeconds,
            timeoutChild: JourneyNodeType.ExitNode,
            segmentChildren: [
              {
                id: "send-message",
                segmentId: appointmentCancelledSegmentId,
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
      const segmentDefinition: SegmentDefinition = {
        entryNode: {
          type: SegmentNodeType.KeyedPerformed,
          id: "segment-entry",
          event: "APPOINTMENT_UPDATE",
          key: "appointmentId",
          properties: [
            {
              path: "operation",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "CANCELLED",
              },
            },
          ],
        } satisfies KeyedPerformedSegmentNode,
        nodes: [],
      };
      const keyedUserPropertyDefinition: UserPropertyDefinition = {
        type: UserPropertyDefinitionType.KeyedPerformed,
        event: "APPOINTMENT_UPDATE",
        key: "appointmentId",
        id: randomUUID(),
      };
      const dateUserPropertyDefinition: UserPropertyDefinition = {
        type: UserPropertyDefinitionType.Performed,
        event: "APPOINTMENT_UPDATE",
        id: randomUUID(),
        path: "appointmentDate",
        properties: [
          {
            path: "operation",
            operator: {
              type: UserPropertyOperatorType.Equals,
              value: "STARTED",
            },
          },
        ],
      };
      [journey] = await Promise.all([
        prisma().journey.create({
          data: {
            name: "appointment-cancelled-journey",
            definition: journeyDefinition,
            workspaceId: workspace.id,
            status: "Running",
          },
        }),
        prisma().segment.create({
          data: {
            id: appointmentCancelledSegmentId,
            name: "appointment-cancelled",
            definition: segmentDefinition,
            workspaceId: workspace.id,
          },
        }),
        prisma().userProperty.create({
          data: {
            workspaceId: workspace.id,
            definition: keyedUserPropertyDefinition,
            name: "appointmentId",
          },
        }),
        prisma().userProperty.create({
          data: {
            id: dateUserPropertyId,
            workspaceId: workspace.id,
            definition: dateUserPropertyDefinition,
            name: "appointmentDate",
          },
        }),
      ]);
      // create a journey with a wait-for node conditioned on a cancellation event
    });
    describe("when two journeys are triggered concurrently for the same user with different appointmentIds but only one is cancelled ", () => {
      let userId: string;
      let appointmentId1: string;
      let appointmentId2: string;

      beforeEach(() => {
        userId = randomUUID();
        appointmentId1 = randomUUID();
        appointmentId2 = randomUUID();
      });

      it("only the cancelled journey should send a message", async () => {
        await worker.runUntil(async () => {
          const timestamp1 = new Date().toISOString();
          const timestamp2 = new Date(
            new Date().getTime() + 1000,
          ).toISOString();

          const handle1 = await testEnv.client.workflow.start(
            userJourneyWorkflow,
            {
              workflowId: getUserJourneyWorkflowId({
                userId,
                journeyId: journey.id,
                eventKeyName: "appointmentId",
                eventKey: appointmentId1,
              }),
              taskQueue: "default",
              args: [
                {
                  journeyId: journey.id,
                  workspaceId: workspace.id,
                  userId,
                  definition: journeyDefinition,
                  version: UserJourneyWorkflowVersion.V2,
                  event: {
                    event: "APPOINTMENT_UPDATE",
                    properties: {
                      operation: "STARTED",
                      appointmentId: appointmentId1,
                    },
                    messageId: randomUUID(),
                    timestamp: timestamp1,
                  },
                },
              ],
            },
          );
          const handle2 = await testEnv.client.workflow.start(
            userJourneyWorkflow,
            {
              workflowId: getUserJourneyWorkflowId({
                userId,
                journeyId: journey.id,
                eventKeyName: "appointmentId",
                eventKey: appointmentId2,
              }),
              taskQueue: "default",
              args: [
                {
                  journeyId: journey.id,
                  workspaceId: workspace.id,
                  userId,
                  definition: journeyDefinition,
                  version: UserJourneyWorkflowVersion.V2,
                  event: {
                    event: "APPOINTMENT_UPDATE",
                    properties: {
                      operation: "STARTED",
                      appointmentId: appointmentId2,
                    },
                    messageId: randomUUID(),
                    timestamp: timestamp2,
                  },
                },
              ],
            },
          );

          await testEnv.sleep(1000);
          await handle1.signal(trackSignal, {
            event: "APPOINTMENT_UPDATE",
            properties: {
              operation: "CANCELLED",
              appointmentId: appointmentId1,
            },
            messageId: randomUUID(),
            timestamp: new Date().toISOString(),
          });
          await testEnv.sleep(5000);
          await handle1.result();

          expect(senderMock).toHaveBeenCalledTimes(1);
          expect(senderMock).toHaveBeenCalledWith(
            expect.objectContaining({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              userPropertyAssignments: expect.objectContaining({
                id: userId,
                appointmentId: appointmentId1,
              }),
            }),
          );

          await testEnv.sleep(oneDaySeconds * 1000);
          await handle2.result();
          expect(senderMock).toHaveBeenCalledTimes(1);
        });
      });
    });
  });
});
