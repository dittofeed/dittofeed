/**
 * @group temporal
 */
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ok } from "neverthrow";

import { createWorker } from "../../test/temporal";
import { clickhouseClient } from "../clickhouse";
import { insert } from "../db";
import { journey as dbJourney } from "../db/schema";
import { searchDeliveries } from "../deliveries";
import {
  ChannelType,
  EmailProviderType,
  InternalEventType,
  Journey,
  JourneyDefinition,
  JourneyNodeType,
  Workspace,
} from "../types";
import { createWorkspace } from "../workspaces";
import {
  userJourneyWorkflow,
  UserJourneyWorkflowVersion,
} from "./userWorkflow";
import { sendMessageFactory } from "./userWorkflow/activities";

jest.setTimeout(30000);

describe("eventEntry journeys with hidden triggering events", () => {
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
          type: EmailProviderType.Smtp,
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
        id: randomUUID(),
        name: randomUUID(),
        updatedAt: new Date(),
      }),
    );
  });

  describe("when a journey is keyed on appointmentId and waits for a cancellation event before sending a message", () => {
    let journey: Journey;
    let journeyDefinition: JourneyDefinition;

    beforeEach(async () => {
      const templateId = randomUUID();

      journeyDefinition = {
        entryNode: {
          type: JourneyNodeType.EventEntryNode,
          event: "APPOINTMENT_UPDATE",
          child: "message",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            type: JourneyNodeType.MessageNode,
            id: "message",
            variant: {
              type: ChannelType.Email,
              templateId,
            },
            child: JourneyNodeType.ExitNode,
          },
        ],
      };
      journey = await insert({
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
      }).then(unwrap);
    });

    it("should hide the message sent event", async () => {
      const userId = randomUUID();
      await testEnv.client.workflow.execute(userJourneyWorkflow, {
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
              messageId: randomUUID(),
              context: {
                hidden: true,
              },
              timestamp: new Date(await testEnv.currentTimeMs()).toISOString(),
            },
          },
        ],
      });

      expect(senderMock).toHaveBeenCalledTimes(1);

      const resultSet = await clickhouseClient().query({
        query: `select event, JSONExtract(message_raw, 'context', 'Nullable(String)') as event_context, properties from user_events_v2 where workspace_id = '${workspace.id}'`,
        format: "JSONEachRow",
      });

      const events = (
        await resultSet.json<{
          event_context: string | null;
          properties: string;
          event: string;
        }>()
      ).map((event) => ({
        event: event.event,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        properties: event.properties ? JSON.parse(event.properties) : null,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        context: event.event_context ? JSON.parse(event.event_context) : null,
      }));

      const messageSentEvent = events.find(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        (event) => event.event === InternalEventType.MessageSent,
      );
      expect(messageSentEvent).not.toBeUndefined();
      expect(messageSentEvent?.context).toEqual(
        expect.objectContaining({
          hidden: true,
        }),
      );

      const deliveries = await searchDeliveries({
        workspaceId: workspace.id,
      });
      expect(deliveries.items).toHaveLength(0);
    });
  });
});
