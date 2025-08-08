import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ok } from "neverthrow";

import { createEnvAndWorker } from "../../test/temporal";
import { insert } from "../db";
import {
  journey as dbJourney,
  segment as dbSegment,
  userProperty as dbUserProperty,
} from "../db/schema";
import {
  ChannelType,
  CursorDirectionEnum,
  DelayVariantType,
  EmailProviderType,
  GroupUserPropertyDefinition,
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
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyDelayVariant,
  UserPropertyOperatorType,
  Workspace,
} from "../types";
import {
  insertUserPropertyAssignments,
  upsertUserProperty,
} from "../userProperties";
import { createWorkspace } from "../workspaces";
import {
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
    workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: randomUUID(),
        updatedAt: new Date(),
      }),
    );

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
    let dateUserPropertyId: string;
    let emailUserPropertyId: string;
    let idUserPropertyId: string;
    const oneDaySeconds = 60 * 60 * 24;

    beforeEach(async () => {
      const appointmentCancelledSegmentId = randomUUID();
      const templateId = randomUUID();
      dateUserPropertyId = randomUUID();
      emailUserPropertyId = randomUUID();
      idUserPropertyId = randomUUID();

      journeyDefinition = {
        entryNode: {
          type: JourneyNodeType.EventEntryNode,
          event: "APPOINTMENT_UPDATE",
          key: "appointmentId",
          child: "delay-for-appointment-date",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.DelayNode,
            id: "delay-for-appointment-date",
            variant: {
              type: DelayVariantType.UserProperty,
              userProperty: dateUserPropertyId,
              offsetDirection: CursorDirectionEnum.Before,
              offsetSeconds: oneDaySeconds,
            } satisfies UserPropertyDelayVariant,
            child: "send-reminder",
          },
          {
            type: JourneyNodeType.SegmentSplitNode,
            id: "check-cancellation",
            variant: {
              type: SegmentSplitVariantType.Boolean,
              segment: appointmentCancelledSegmentId,
              trueChild: JourneyNodeType.ExitNode,
              falseChild: "send-reminder",
            },
          } satisfies SegmentSplitNode,
          {
            type: JourneyNodeType.MessageNode,
            id: "send-reminder",
            variant: {
              type: ChannelType.Email,
              templateId,
            },
            child: "wait-for-cancellation",
          },
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
        path: "appointmentId",
        id: randomUUID(),
      };
      [journey] = await Promise.all([
        insert({
          table: dbJourney,
          values: {
            id: randomUUID(),
            name: "appointment-cancelled-journey",
            definition: journeyDefinition,
            workspaceId: workspace.id,
            status: "Running",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }).then(unwrap),
        insert({
          table: dbSegment,
          values: {
            id: appointmentCancelledSegmentId,
            name: "appointment-cancelled",
            definition: segmentDefinition,
            workspaceId: workspace.id,
            updatedAt: new Date(),
          },
        }).then(unwrap),
        insert({
          table: dbUserProperty,
          values: {
            id: randomUUID(),
            name: "appointmentId",
            definition: keyedUserPropertyDefinition,
            workspaceId: workspace.id,
            updatedAt: new Date(),
          },
        }).then(unwrap),
      ]);
    });

    describe("when two journeys are triggered concurrently for the same user with different appointmentIds but only one is cancelled ", () => {
      let userId: string;
      let appointmentId1: string;
      let appointmentId2: string;

      beforeEach(async () => {
        userId = randomUUID();
        appointmentId1 = randomUUID();
        appointmentId2 = randomUUID();

        const dateUserPropertyDefinition: UserPropertyDefinition = {
          type: UserPropertyDefinitionType.KeyedPerformed,
          event: "APPOINTMENT_UPDATE",
          id: randomUUID(),
          key: "appointmentId",
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
        await Promise.all([
          upsertUserProperty({
            id: dateUserPropertyId,
            workspaceId: workspace.id,
            definition: dateUserPropertyDefinition,
            name: "appointmentDate",
          }).then(unwrap),
          upsertUserProperty(
            {
              id: idUserPropertyId,
              workspaceId: workspace.id,
              definition: {
                type: UserPropertyDefinitionType.Id,
              },
              name: "id",
            },
            {
              skipProtectedCheck: true,
            },
          ).then(unwrap),
          upsertUserProperty(
            {
              id: emailUserPropertyId,
              workspaceId: workspace.id,
              definition: {
                type: UserPropertyDefinitionType.Trait,
                path: "email",
              },
              name: "email",
            },
            {
              skipProtectedCheck: true,
            },
          ).then(unwrap),
        ]);
        await insertUserPropertyAssignments([
          {
            workspaceId: workspace.id,
            userId,
            userPropertyId: idUserPropertyId,
            value: userId,
          },
          {
            workspaceId: workspace.id,
            userId,
            userPropertyId: emailUserPropertyId,
            value: "test@test.com",
          },
        ]);
      });

      it("only the cancelled journey should send a message", async () => {
        await worker.runUntil(async () => {
          const timestamp1 = new Date().toISOString();
          const timestamp2 = new Date(
            new Date().getTime() + 1000,
          ).toISOString();

          const now = await testEnv.currentTimeMs();
          const appointmentDate = new Date(
            now + 1000 * oneDaySeconds * 2,
          ).toISOString();

          const handle1 = await testEnv.client.workflow.start(
            userJourneyWorkflow,
            {
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
                    event: "APPOINTMENT_UPDATE",
                    properties: {
                      operation: "STARTED",
                      appointmentId: appointmentId1,
                      appointmentDate,
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
              workflowId: "workflow2",
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
                      appointmentDate,
                    },
                    messageId: randomUUID(),
                    timestamp: timestamp2,
                  },
                },
              ],
            },
          );

          await testEnv.sleep(5000);

          expect(
            senderMock,
            "should not have sent any messages before waiting for day before appointment date",
          ).toHaveBeenCalledTimes(0);

          await testEnv.sleep(1000 * oneDaySeconds);

          expect(senderMock).toHaveBeenCalledTimes(2);
          expect(
            senderMock.mock.calls.filter(
              (call) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                call[0].userPropertyAssignments?.appointmentId ===
                appointmentId1,
            ),
            "should have sent a reminder message for appointment 1",
          ).toHaveLength(1);
          expect(
            senderMock.mock.calls.filter(
              (call) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                call[0].userPropertyAssignments?.appointmentId ===
                appointmentId2,
            ),
            "should have sent a reminder message for appointment 2",
          ).toHaveLength(1);
          expect(
            senderMock.mock.calls.filter(
              (call) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                call[0].userPropertyAssignments?.email === "test@test.com",
            ).length,
            "should have passed the db email user property to the sender",
          ).toBeGreaterThanOrEqual(1);

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

          await testEnv.sleep(oneDaySeconds * 1000);
          await handle2.result();

          expect(
            senderMock.mock.calls.filter(
              (call) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                call[0].userPropertyAssignments?.appointmentId ===
                appointmentId1,
            ),
            "should have sent a reminder and cancellation message for appointment 1",
          ).toHaveLength(2);

          expect(
            senderMock.mock.calls.filter(
              (call) =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                call[0].userPropertyAssignments?.appointmentId ===
                appointmentId2,
            ),
            "should have sent a reminder message for appointment 2 but not a cancellation message",
          ).toHaveLength(1);
          expect(senderMock).toHaveBeenCalledTimes(3);
        });
      });
    });
    describe("when the appointment date user property is part of an any of group", () => {
      beforeEach(async () => {
        const dateUserPropertyDefinition: UserPropertyDefinition = {
          type: UserPropertyDefinitionType.Group,
          entry: "1",
          nodes: [
            {
              type: UserPropertyDefinitionType.AnyOf,
              id: "1",
              children: ["2", "3"],
            },
            {
              id: "2",
              type: UserPropertyDefinitionType.Trait,
              path: "nextAppointmentDate",
            },
            {
              id: "3",
              type: UserPropertyDefinitionType.KeyedPerformed,
              event: "APPOINTMENT_UPDATE",
              key: "appointmentId",
              path: "appointmentDate",
            },
          ],
        } satisfies GroupUserPropertyDefinition;

        await insert({
          table: dbUserProperty,
          values: {
            id: dateUserPropertyId,
            workspaceId: workspace.id,
            definition: dateUserPropertyDefinition,
            name: "appointmentDate",
            updatedAt: new Date(),
          },
        }).then(unwrap);
      });

      it("should wait for the resolved value of the user property group", async () => {
        const userId = randomUUID();
        const appointmentId1 = randomUUID();

        await worker.runUntil(async () => {
          const timestamp1 = new Date().toISOString();
          const now = await testEnv.currentTimeMs();
          const appointmentDate = new Date(
            now + 1000 * oneDaySeconds * 2,
          ).toISOString();

          await testEnv.client.workflow.start(userJourneyWorkflow, {
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
                  event: "APPOINTMENT_UPDATE",
                  properties: {
                    operation: "STARTED",
                    appointmentId: appointmentId1,
                    appointmentDate,
                  },
                  messageId: randomUUID(),
                  timestamp: timestamp1,
                },
              },
            ],
          });

          await testEnv.sleep(5000);

          expect(
            senderMock,
            "should not have sent any messages before waiting for day before appointment date",
          ).toHaveBeenCalledTimes(0);

          await testEnv.sleep(1000 * oneDaySeconds);

          expect(senderMock).toHaveBeenCalledTimes(1);
        });
      });
    });
  });
});
