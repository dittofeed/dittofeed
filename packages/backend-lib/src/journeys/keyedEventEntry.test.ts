/**
 * @group temporal
 */
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ok } from "neverthrow";

import { createWorker } from "../../test/temporal";
import { submitBatch } from "../apps/batch";
import { db, insert } from "../db";
import {
  journey as dbJourney,
  segment as dbSegment,
  userJourneyEvent as dbUserJourneyEvent,
  userProperty as dbUserProperty,
} from "../db/schema";
import logger from "../logger";
import {
  BatchItem,
  ChannelType,
  CursorDirectionEnum,
  DelayVariantType,
  EmailProviderType,
  EventType,
  GroupUserPropertyDefinition,
  InternalEventType,
  Journey,
  JourneyDefinition,
  JourneyNodeType,
  KeyedPerformedSegmentNode,
  LocalTimeDelayVariant,
  RelationalOperators,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentSplitNode,
  SegmentSplitVariantType,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyDelayVariant,
  UserPropertyOperatorType,
  UserWorkflowTrackEvent,
  Workspace,
} from "../types";
import {
  insertUserPropertyAssignments,
  upsertUserProperty,
} from "../userProperties";
import { createWorkspace } from "../workspaces";
import {
  trackSignal,
  TrackSignalParamsVersion,
  userJourneyWorkflow,
  UserJourneyWorkflowVersion,
} from "./userWorkflow";
import { sendMessageFactory } from "./userWorkflow/activities";

jest.setTimeout(30000);

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

  let workerRunPromise: Promise<void>;

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
    senderMock.mockClear();
    workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: randomUUID(),
        updatedAt: new Date(),
      }),
    );
  });

  describe("when the same appointment event is received twice", () => {
    it("runs the keyed journey only once per appointment id", async () => {
      const messageNodeId = "send-reminder";
      const templateId = randomUUID();
      const journeyDefinition: JourneyDefinition = {
        entryNode: {
          type: JourneyNodeType.EventEntryNode,
          event: "APPOINTMENT_UPDATE",
          key: "appointmentId",
          child: messageNodeId,
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.MessageNode,
            id: messageNodeId,
            variant: {
              type: ChannelType.Email,
              templateId,
            },
            child: JourneyNodeType.ExitNode,
          },
        ],
      };

      const journey = await insert({
        table: dbJourney,
        values: {
          id: randomUUID(),
          name: "simple-keyed-journey",
          definition: journeyDefinition,
          workspaceId: workspace.id,
          status: "Running",
          canRunMultiple: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }).then(unwrap);

      const userId = randomUUID();
      const emailUserPropertyId = randomUUID();
      const idUserPropertyId = randomUUID();

      await Promise.all([
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
        ),
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
        ),
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
          value: "test@example.com",
        },
      ]);

      const firstMessageId = randomUUID();
      const now = await testEnv.currentTimeMs();
      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [
            {
              type: EventType.Track,
              event: "APPOINTMENT_UPDATE",
              userId,
              messageId: firstMessageId,
              properties: {
                appointmentId: "appointment-1",
              },
              timestamp: new Date(now).toISOString(),
            },
          ],
        },
      });

      const handle1 = await testEnv.client.workflow.start(userJourneyWorkflow, {
        workflowId: `workflow-${randomUUID()}`,
        taskQueue: "default",
        args: [
          {
            journeyId: journey.id,
            workspaceId: workspace.id,
            userId,
            definition: journeyDefinition,
            version: UserJourneyWorkflowVersion.V3,
            eventKey: "appointment-1",
            messageId: firstMessageId,
          },
        ],
      });

      await handle1.result();
      expect(senderMock).toHaveBeenCalledTimes(1);

      const journeyEvents = await db().query.userJourneyEvent.findMany({
        where: and(
          eq(dbUserJourneyEvent.journeyId, journey.id),
          eq(dbUserJourneyEvent.userId, userId),
        ),
      });
      logger().debug({ journeyEvents }, "journey events");
      expect(journeyEvents.length).toBeGreaterThan(0);
      expect(
        journeyEvents.every((event) => event.eventKey === "appointment-1"),
      ).toBe(true);
      expect(
        journeyEvents.filter((event) => event.eventKey === "appointment-1"),
      ).not.toHaveLength(0);
      expect(
        journeyEvents
          .filter((event) => event.eventKey === "appointment-1")
          .every((event) => event.eventKeyName === "appointmentId"),
      ).toBe(true);

      const secondMessageId = randomUUID();
      const now2 = await testEnv.currentTimeMs();
      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [
            {
              type: EventType.Track,
              event: "APPOINTMENT_UPDATE",
              userId,
              messageId: secondMessageId,
              properties: {
                appointmentId: "appointment-1",
              },
              timestamp: new Date(now2).toISOString(),
            },
          ],
        },
      });

      const handle2 = await testEnv.client.workflow.start(userJourneyWorkflow, {
        workflowId: `workflow-${randomUUID()}`,
        taskQueue: "default",
        args: [
          {
            journeyId: journey.id,
            workspaceId: workspace.id,
            userId,
            definition: journeyDefinition,
            version: UserJourneyWorkflowVersion.V3,
            eventKey: "appointment-1",
            messageId: secondMessageId,
          },
        ],
      });

      await handle2.result();
      expect(senderMock).toHaveBeenCalledTimes(1);
    });
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
        const now = await testEnv.currentTimeMs();
        const timestamp1 = new Date(now).toISOString();
        const timestamp2 = new Date(now + 1000).toISOString();
        const appointmentDate = new Date(
          now + 1000 * oneDaySeconds * 2,
        ).toISOString();

        const workflowId1 = `workflow1-${randomUUID()}`;
        const handle1 = await testEnv.client.workflow.start(
          userJourneyWorkflow,
          {
            workflowId: workflowId1,
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
        const workflowId2 = `workflow2-${randomUUID()}`;
        const handle2 = await testEnv.client.workflow.start(
          userJourneyWorkflow,
          {
            workflowId: workflowId2,
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
              call[0].userPropertyAssignments?.appointmentId === appointmentId1,
          ),
          "should have sent a reminder message for appointment 1",
        ).toHaveLength(1);
        expect(
          senderMock.mock.calls.filter(
            (call) =>
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              call[0].userPropertyAssignments?.appointmentId === appointmentId2,
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

        const signalTime = await testEnv.currentTimeMs();
        await handle1.signal(trackSignal, {
          event: "APPOINTMENT_UPDATE",
          properties: {
            operation: "CANCELLED",
            appointmentId: appointmentId1,
          },
          messageId: randomUUID(),
          timestamp: new Date(signalTime).toISOString(),
        });
        await testEnv.sleep(5000);
        await handle1.result();

        await testEnv.sleep(oneDaySeconds * 1000);
        await handle2.result();

        expect(
          senderMock.mock.calls.filter(
            (call) =>
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              call[0].userPropertyAssignments?.appointmentId === appointmentId1,
          ),
          "should have sent a reminder and cancellation message for appointment 1",
        ).toHaveLength(2);

        expect(
          senderMock.mock.calls.filter(
            (call) =>
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              call[0].userPropertyAssignments?.appointmentId === appointmentId2,
          ),
          "should have sent a reminder message for appointment 2 but not a cancellation message",
        ).toHaveLength(1);
        expect(senderMock).toHaveBeenCalledTimes(3);
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

        const now = await testEnv.currentTimeMs();
        const timestamp1 = new Date(now).toISOString();
        const appointmentDate = new Date(
          now + 1000 * oneDaySeconds * 2,
        ).toISOString();

        await testEnv.client.workflow.start(userJourneyWorkflow, {
          workflowId: `workflow1-${randomUUID()}`,
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

  describe("when two journeys are triggered concurrently for the same user with different appointmentIds but only one is cancelled with new style args", () => {
    let journey: Journey;
    let journeyDefinition: JourneyDefinition;
    let dateUserPropertyId: string;
    const oneDaySeconds = 60 * 60 * 24;
    let userId: string;
    let appointmentId1: string;
    let appointmentId2: string;
    let event1: UserWorkflowTrackEvent;
    let event2: UserWorkflowTrackEvent;

    beforeEach(async () => {
      userId = randomUUID();
      appointmentId1 = randomUUID();
      appointmentId2 = randomUUID();

      const appointmentCancelledSegmentId = randomUUID();
      const templateId = randomUUID();
      dateUserPropertyId = randomUUID();

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

      const now = await testEnv.currentTimeMs();
      const timestamp1 = new Date(now).toISOString();
      const timestamp2 = new Date(now + 1000).toISOString();

      const appointmentDate = new Date(
        now + 1000 * oneDaySeconds * 2,
      ).toISOString();

      logger().debug(
        {
          now,
          nowISO: new Date(now).toISOString(),
          timestamp1,
          timestamp2,
          appointmentDate,
          delayTargetTime: new Date(now + 1000 * oneDaySeconds).toISOString(),
        },
        "V3 test beforeEach - setting up events",
      );

      const eventFull1: BatchItem = {
        type: EventType.Track,
        event: "APPOINTMENT_UPDATE",
        userId,
        messageId: randomUUID(),
        properties: {
          operation: "STARTED",
          appointmentId: appointmentId1,
          appointmentDate,
        },
        timestamp: timestamp1,
      } as const;
      event1 = eventFull1;

      const eventFull2: BatchItem = {
        type: EventType.Track,
        event: "APPOINTMENT_UPDATE",
        userId,
        messageId: randomUUID(),
        properties: {
          operation: "STARTED",
          appointmentId: appointmentId2,
          appointmentDate,
        },
        timestamp: timestamp2,
      } as const;
      event2 = eventFull2;

      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [eventFull1, eventFull2],
        },
      });
    });

    it("only the cancelled journey should send a message", async () => {
      const testStartTime = await testEnv.currentTimeMs();
      logger().debug(
        {
          testStartTime,
          testStartTimeISO: new Date(testStartTime).toISOString(),
          event1Timestamp: event1.timestamp,
          event2Timestamp: event2.timestamp,
        },
        "V3 test starting - time state",
      );

      const handle1 = await testEnv.client.workflow.start(userJourneyWorkflow, {
        workflowId: `workflow1-${randomUUID()}`,
        taskQueue: "default",
        args: [
          {
            journeyId: journey.id,
            workspaceId: workspace.id,
            userId,
            definition: journeyDefinition,
            version: UserJourneyWorkflowVersion.V3,
            eventKey: appointmentId1,
            messageId: event1.messageId,
          },
        ],
      });
      const handle2 = await testEnv.client.workflow.start(userJourneyWorkflow, {
        workflowId: `workflow2-${randomUUID()}`,
        taskQueue: "default",
        args: [
          {
            journeyId: journey.id,
            workspaceId: workspace.id,
            userId,
            definition: journeyDefinition,
            version: UserJourneyWorkflowVersion.V3,
            eventKey: appointmentId2,
            messageId: event2.messageId,
          },
        ],
      });

      logger().debug("V3 test - workflows started, sleeping 5000ms");
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
            call[0].userPropertyAssignments?.appointmentId === appointmentId1,
        ),
        "should have sent a reminder message for appointment 1",
      ).toHaveLength(1);
      expect(
        senderMock.mock.calls.filter(
          (call) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            call[0].userPropertyAssignments?.appointmentId === appointmentId2,
        ),
        "should have sent a reminder message for appointment 2",
      ).toHaveLength(1);

      const cancelTime = await testEnv.currentTimeMs();
      const cancelledEvent = {
        type: EventType.Track,
        event: "APPOINTMENT_UPDATE",
        userId,
        messageId: randomUUID(),
        properties: {
          operation: "CANCELLED",
          appointmentId: appointmentId1,
        },
        timestamp: new Date(cancelTime).toISOString(),
      } as const;

      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [cancelledEvent],
        },
      });

      await handle1.signal(trackSignal, {
        version: TrackSignalParamsVersion.V2,
        messageId: cancelledEvent.messageId,
      });
      await testEnv.sleep(5000);
      await handle1.result();

      await testEnv.sleep(oneDaySeconds * 1000);
      await handle2.result();

      expect(
        senderMock.mock.calls.filter(
          (call) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            call[0].userPropertyAssignments?.appointmentId === appointmentId1,
        ),
        "should have sent a reminder and cancellation message for appointment 1",
      ).toHaveLength(2);

      expect(
        senderMock.mock.calls.filter(
          (call) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            call[0].userPropertyAssignments?.appointmentId === appointmentId2,
        ),
        "should have sent a reminder message for appointment 2 but not a cancellation message",
      ).toHaveLength(1);
      expect(senderMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("when two journeys are triggered concurrently for the same user with different appointmentIds but only one is cancelled with mixed V2 workflow args and V2 signal args", () => {
    let journey: Journey;
    let journeyDefinition: JourneyDefinition;
    let dateUserPropertyId: string;
    const oneDaySeconds = 60 * 60 * 24;
    let userId: string;
    let appointmentId1: string;
    let appointmentId2: string;
    let event1: UserWorkflowTrackEvent;
    let event2: UserWorkflowTrackEvent;

    beforeEach(async () => {
      userId = randomUUID();
      appointmentId1 = randomUUID();
      appointmentId2 = randomUUID();

      const appointmentCancelledSegmentId = randomUUID();
      const templateId = randomUUID();
      dateUserPropertyId = randomUUID();

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

      const now = await testEnv.currentTimeMs();
      const timestamp1 = new Date(now).toISOString();
      const timestamp2 = new Date(now + 1000).toISOString();

      const appointmentDate = new Date(
        now + 1000 * oneDaySeconds * 2,
      ).toISOString();

      const eventFull1: BatchItem = {
        type: EventType.Track,
        event: "APPOINTMENT_UPDATE",
        userId,
        messageId: randomUUID(),
        properties: {
          operation: "STARTED",
          appointmentId: appointmentId1,
          appointmentDate,
        },
        timestamp: timestamp1,
      } as const;
      event1 = eventFull1;

      const eventFull2: BatchItem = {
        type: EventType.Track,
        event: "APPOINTMENT_UPDATE",
        userId,
        messageId: randomUUID(),
        properties: {
          operation: "STARTED",
          appointmentId: appointmentId2,
          appointmentDate,
        },
        timestamp: timestamp2,
      } as const;
      event2 = eventFull2;

      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [eventFull1, eventFull2],
        },
      });
    });

    it("only the cancelled journey should send a message", async () => {
      const mixedWorkflowId1 = `workflow1-mixed-${randomUUID()}`;
      const handle1 = await testEnv.client.workflow.start(userJourneyWorkflow, {
        workflowId: mixedWorkflowId1,
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
                appointmentDate: event1.properties?.appointmentDate,
              },
              messageId: event1.messageId,
              timestamp: event1.timestamp,
            },
          },
        ],
      });
      const mixedWorkflowId2 = `workflow2-mixed-${randomUUID()}`;
      const handle2 = await testEnv.client.workflow.start(userJourneyWorkflow, {
        workflowId: mixedWorkflowId2,
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
                appointmentDate: event2.properties?.appointmentDate,
              },
              messageId: event2.messageId,
              timestamp: event2.timestamp,
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

      expect(senderMock).toHaveBeenCalledTimes(2);
      expect(
        senderMock.mock.calls.filter(
          (call) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            call[0].userPropertyAssignments?.appointmentId === appointmentId1,
        ),
        "should have sent a reminder message for appointment 1",
      ).toHaveLength(1);
      expect(
        senderMock.mock.calls.filter(
          (call) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            call[0].userPropertyAssignments?.appointmentId === appointmentId2,
        ),
        "should have sent a reminder message for appointment 2",
      ).toHaveLength(1);

      const cancelTime = await testEnv.currentTimeMs();
      const cancelledEvent = {
        type: EventType.Track,
        event: "APPOINTMENT_UPDATE",
        userId,
        messageId: randomUUID(),
        properties: {
          operation: "CANCELLED",
          appointmentId: appointmentId1,
        },
        timestamp: new Date(cancelTime).toISOString(),
      } as const;

      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [cancelledEvent],
        },
      });

      // Use V2 signal args (new style) with V2 workflow args (old style)
      await handle1.signal(trackSignal, {
        version: TrackSignalParamsVersion.V2,
        messageId: cancelledEvent.messageId,
      });
      await testEnv.sleep(5000);
      await handle1.result();

      await testEnv.sleep(oneDaySeconds * 1000);
      await handle2.result();

      expect(
        senderMock.mock.calls.filter(
          (call) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            call[0].userPropertyAssignments?.appointmentId === appointmentId1,
        ),
        "should have sent a reminder and cancellation message for appointment 1",
      ).toHaveLength(2);

      expect(
        senderMock.mock.calls.filter(
          (call) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            call[0].userPropertyAssignments?.appointmentId === appointmentId2,
        ),
        "should have sent a reminder message for appointment 2 but not a cancellation message",
      ).toHaveLength(1);
      expect(senderMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("when a journey uses a local time delay with defaultTimezone", () => {
    let journey: Journey;
    let journeyDefinition: JourneyDefinition;
    let userId: string;
    let idUserPropertyId: string;

    beforeEach(async () => {
      userId = randomUUID();
      idUserPropertyId = randomUUID();

      journeyDefinition = {
        entryNode: {
          type: JourneyNodeType.EventEntryNode,
          event: "SIGNUP",
          key: "signupId",
          child: "delay-until-morning",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.DelayNode,
            id: "delay-until-morning",
            variant: {
              type: DelayVariantType.LocalTime,
              hour: 9,
              minute: 0,
              defaultTimezone: "America/New_York",
            } satisfies LocalTimeDelayVariant,
            child: JourneyNodeType.ExitNode,
          },
        ],
      };

      journey = await insert({
        table: dbJourney,
        values: {
          id: randomUUID(),
          name: "delay-timezone-journey",
          definition: journeyDefinition,
          workspaceId: workspace.id,
          status: "Running",
          canRunMultiple: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }).then(unwrap);

      await upsertUserProperty(
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
      );

      await insertUserPropertyAssignments([
        {
          workspaceId: workspace.id,
          userId,
          userPropertyId: idUserPropertyId,
          value: userId,
        },
      ]);
    });

    it("should delay until 9 AM in the defaultTimezone (America/New_York)", async () => {
      // Get the current time in the test environment
      const startTime = await testEnv.currentTimeMs();

      const messageId = randomUUID();
      const signupId = randomUUID();

      // Submit the batch to create the event
      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [
            {
              type: EventType.Track,
              event: "SIGNUP",
              userId,
              messageId,
              properties: {
                signupId,
              },
              timestamp: new Date(startTime).toISOString(),
            } satisfies BatchItem,
          ],
        },
      });

      // Execute the workflow and wait for it to complete
      await testEnv.client.workflow.execute(userJourneyWorkflow, {
        workflowId: `workflow-${userId}-${signupId}`,
        taskQueue: "default",
        args: [
          {
            journeyId: journey.id,
            workspaceId: workspace.id,
            userId,
            definition: journeyDefinition,
            version: UserJourneyWorkflowVersion.V3,
            eventKey: signupId,
            messageId,
          },
        ],
      });

      // Get the time after the workflow completes
      const endTime = await testEnv.currentTimeMs();

      // Convert the end time to America/New_York timezone and verify it's 9 AM
      const endDate = new Date(endTime);
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const nyTime = formatter.format(endDate);

      // Should be 9:XX in New York time (allowing for small timing variations)
      // Extract hour and minutes
      const [hour, minute] = nyTime.split(":");
      expect(hour).toBe("09");
      // Minutes should be close to 00 (allow up to 5 minutes of workflow overhead)
      expect(minute).toBeDefined();
      expect(parseInt(minute ?? "0", 10)).toBeLessThan(5);
    });
  });
  // FIXME run a test that starts a worker with the previous workflow and activity definitions and then signals the workflow with the new args

  describe("when a keyed performed segment filters on event properties", () => {
    let journey: Journey;
    let journeyDefinition: JourneyDefinition;
    let segmentId: string;
    let templateId: string;
    let idUserPropertyId: string;
    let emailUserPropertyId: string;

    beforeEach(async () => {
      segmentId = randomUUID();
      templateId = randomUUID();
      idUserPropertyId = randomUUID();
      emailUserPropertyId = randomUUID();

      const segmentDefinition: SegmentDefinition = {
        entryNode: {
          type: SegmentNodeType.KeyedPerformed,
          id: "entry",
          event: "late_delivery",
          key: "order_id",
          timesOperator: RelationalOperators.GreaterThanOrEqual,
          properties: [
            {
              path: "late_delivery_in_mins",
              operator: {
                type: SegmentOperatorType.GreaterThanOrEqual,
                value: 15,
              },
            },
          ],
        } satisfies KeyedPerformedSegmentNode,
        nodes: [],
      };

      journeyDefinition = {
        entryNode: {
          type: JourneyNodeType.EventEntryNode,
          event: "late_delivery",
          key: "order_id",
          child: "check-late-delivery",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.SegmentSplitNode,
            id: "check-late-delivery",
            variant: {
              type: SegmentSplitVariantType.Boolean,
              segment: segmentId,
              trueChild: "send-message",
              falseChild: JourneyNodeType.ExitNode,
            },
          } satisfies SegmentSplitNode,
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

      [journey] = await Promise.all([
        insert({
          table: dbJourney,
          values: {
            id: randomUUID(),
            name: "late-delivery-journey",
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
            id: segmentId,
            name: "late-delivery-segment",
            definition: segmentDefinition,
            workspaceId: workspace.id,
            updatedAt: new Date(),
          },
        }).then(unwrap),
      ]);

      await Promise.all([
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
        ),
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
        ),
      ]);
    });

    it("should only send a message when the keyed performed segment property filter is satisfied with numeric keys", async () => {
      const userId1 = 1;
      const userId2 = 2;
      const orderId1 = 100;
      const orderId2 = 200;

      await Promise.all([
        insertUserPropertyAssignments([
          {
            workspaceId: workspace.id,
            userId: String(userId1),
            userPropertyId: idUserPropertyId,
            value: String(userId1),
          },
          {
            workspaceId: workspace.id,
            userId: String(userId1),
            userPropertyId: emailUserPropertyId,
            value: "user1@test.com",
          },
        ]),
        insertUserPropertyAssignments([
          {
            workspaceId: workspace.id,
            userId: String(userId2),
            userPropertyId: idUserPropertyId,
            value: String(userId2),
          },
          {
            workspaceId: workspace.id,
            userId: String(userId2),
            userPropertyId: emailUserPropertyId,
            value: "user2@test.com",
          },
        ]),
      ]);

      const messageId1 = randomUUID();
      const messageId2 = randomUUID();
      const now = await testEnv.currentTimeMs();

      // User 1: late_delivery_in_mins = 20 (>= 15, should satisfy segment)
      const event1: BatchItem = {
        type: EventType.Track,
        event: "late_delivery",
        userId: String(userId1),
        messageId: messageId1,
        properties: {
          order_id: orderId1,
          late_delivery_in_mins: 20,
        },
        timestamp: new Date(now).toISOString(),
      };

      // User 2: late_delivery_in_mins = 10 (< 15, should NOT satisfy segment)
      const event2: BatchItem = {
        type: EventType.Track,
        event: "late_delivery",
        userId: String(userId2),
        messageId: messageId2,
        properties: {
          order_id: orderId2,
          late_delivery_in_mins: 10,
        },
        timestamp: new Date(now + 1000).toISOString(),
      };

      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [event1, event2],
        },
      });

      const handle1 = await testEnv.client.workflow.start(userJourneyWorkflow, {
        workflowId: `workflow-user1-${randomUUID()}`,
        taskQueue: "default",
        args: [
          {
            journeyId: journey.id,
            workspaceId: workspace.id,
            userId: String(userId1),
            definition: journeyDefinition,
            version: UserJourneyWorkflowVersion.V3,
            eventKey: String(orderId1),
            messageId: messageId1,
          },
        ],
      });

      const handle2 = await testEnv.client.workflow.start(userJourneyWorkflow, {
        workflowId: `workflow-user2-${randomUUID()}`,
        taskQueue: "default",
        args: [
          {
            journeyId: journey.id,
            workspaceId: workspace.id,
            userId: String(userId2),
            definition: journeyDefinition,
            version: UserJourneyWorkflowVersion.V3,
            eventKey: String(orderId2),
            messageId: messageId2,
          },
        ],
      });

      await Promise.all([handle1.result(), handle2.result()]);

      // Check that user 1 (who satisfies the segment) received at least one message
      const user1Messages = senderMock.mock.calls.filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (call) => call[0].userId === String(userId1),
      );
      expect(
        user1Messages.length,
        "user 1 (late_delivery_in_mins >= 15) should have received at least one message",
      ).toBeGreaterThanOrEqual(1);

      // Check that user 2 (who does not satisfy the segment) received no messages
      const user2Messages = senderMock.mock.calls.filter(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (call) => call[0].userId === String(userId2),
      );
      expect(
        user2Messages.length,
        "user 2 (late_delivery_in_mins < 15) should not have received any messages",
      ).toBe(0);
    });
  });
});
