import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ok } from "neverthrow";

import { createWorker } from "../../test/temporal";
import { insert } from "../db";
import { journey as dbJourney } from "../db/schema";
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

jest.setTimeout(15000);

describe("randomCohortJourney", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;
  let journey: Journey;
  let journeyDefinition: JourneyDefinition;
  let templateId1: string;
  let templateId2: string;
  let templateId3: string;

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

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
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

    templateId1 = randomUUID();
    templateId2 = randomUUID();
    templateId3 = randomUUID();

    journeyDefinition = {
      entryNode: {
        type: JourneyNodeType.EventEntryNode,
        event: "TestEvent",
        child: "random-cohort-split",
      },
      exitNode: {
        type: JourneyNodeType.ExitNode,
      },
      nodes: [
        {
          type: JourneyNodeType.RandomCohortNode,
          id: "random-cohort-split",
          children: [
            {
              id: "message-1",
              percent: 33.33,
              name: "Cohort A",
            },
            {
              id: "message-2",
              percent: 33.33,
              name: "Cohort B",
            },
            {
              id: "message-3",
              percent: 33.34,
              name: "Cohort C",
            },
          ],
        },
        {
          type: JourneyNodeType.MessageNode,
          id: "message-1",
          variant: {
            type: ChannelType.Email,
            templateId: templateId1,
          },
          child: JourneyNodeType.ExitNode,
        },
        {
          type: JourneyNodeType.MessageNode,
          id: "message-2",
          variant: {
            type: ChannelType.Email,
            templateId: templateId2,
          },
          child: JourneyNodeType.ExitNode,
        },
        {
          type: JourneyNodeType.MessageNode,
          id: "message-3",
          variant: {
            type: ChannelType.Email,
            templateId: templateId3,
          },
          child: JourneyNodeType.ExitNode,
        },
      ],
    };

    journey = await insert({
      table: dbJourney,
      values: {
        id: randomUUID(),
        name: "random-cohort-journey",
        definition: journeyDefinition,
        workspaceId: workspace.id,
        status: "Running",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }).then(unwrap);
  });

  afterEach(() => {
    senderMock.mockClear();
  });

  describe("when assigned to the first cohort", () => {
    beforeEach(async () => {
      const testActivities = {
        sendMessageV2: sendMessageFactory(senderMock),
        getRandomNumber: jest.fn().mockResolvedValue(0.1),
      };

      worker = await createWorker({
        testEnv,
        activityOverrides: testActivities,
      });
    });

    it("receives the first message", async () => {
      await worker.runUntil(async () => {
        const userId = randomUUID();
        const messageId = randomUUID();

        await testEnv.client.workflow.execute(userJourneyWorkflow, {
          workflowId: randomUUID(),
          taskQueue: "default",
          args: [
            {
              journeyId: journey.id,
              workspaceId: workspace.id,
              userId,
              definition: journeyDefinition,
              version: UserJourneyWorkflowVersion.V2,
              event: {
                event: "TestEvent",
                properties: {},
                messageId,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        });

        expect(senderMock).toHaveBeenCalledTimes(1);
        expect(senderMock).toHaveBeenCalledWith(
          expect.objectContaining({
            templateId: templateId1,
          }),
        );
      });
    });
  });

  describe("when assigned to the second cohort", () => {
    beforeEach(async () => {
      const testActivities = {
        sendMessageV2: sendMessageFactory(senderMock),
        getRandomNumber: jest.fn().mockResolvedValue(0.5),
      };

      worker = await createWorker({
        testEnv,
        activityOverrides: testActivities,
      });
    });

    it("receives the second message", async () => {
      await worker.runUntil(async () => {
        const userId = randomUUID();
        const messageId = randomUUID();

        await testEnv.client.workflow.execute(userJourneyWorkflow, {
          workflowId: randomUUID(),
          taskQueue: "default",
          args: [
            {
              journeyId: journey.id,
              workspaceId: workspace.id,
              userId,
              definition: journeyDefinition,
              version: UserJourneyWorkflowVersion.V2,
              event: {
                event: "TestEvent",
                properties: {},
                messageId,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        });

        expect(senderMock).toHaveBeenCalledTimes(1);
        expect(senderMock).toHaveBeenCalledWith(
          expect.objectContaining({
            templateId: templateId2,
          }),
        );
      });
    });
  });

  describe("when assigned to the third cohort", () => {
    beforeEach(async () => {
      const testActivities = {
        sendMessageV2: sendMessageFactory(senderMock),
        getRandomNumber: jest.fn().mockResolvedValue(0.9),
      };

      worker = await createWorker({
        testEnv,
        activityOverrides: testActivities,
      });
    });

    it("receives the third message", async () => {
      await worker.runUntil(async () => {
        const userId = randomUUID();
        const messageId = randomUUID();

        await testEnv.client.workflow.execute(userJourneyWorkflow, {
          workflowId: randomUUID(),
          taskQueue: "default",
          args: [
            {
              journeyId: journey.id,
              workspaceId: workspace.id,
              userId,
              definition: journeyDefinition,
              version: UserJourneyWorkflowVersion.V2,
              event: {
                event: "TestEvent",
                properties: {},
                messageId,
                timestamp: new Date().toISOString(),
              },
            },
          ],
        });

        expect(senderMock).toHaveBeenCalledTimes(1);
        expect(senderMock).toHaveBeenCalledWith(
          expect.objectContaining({
            templateId: templateId3,
          }),
        );
      });
    });
  });
});
