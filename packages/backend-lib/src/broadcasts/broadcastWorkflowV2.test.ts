import { randomUUID } from "node:crypto";

import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { zonedTimeToUtc } from "date-fns-tz";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { err, ok } from "neverthrow";
import { times } from "remeda";

import { createEnvAndWorker } from "../../test/temporal";
import { broadcastV2ToResource } from "../broadcasts";
import { insert } from "../db";
import * as schema from "../db/schema";
import { searchDeliveries } from "../deliveries";
import { SendMessageParameters } from "../messaging";
import {
  updateUserSubscriptions,
  upsertSubscriptionGroup,
} from "../subscriptionGroups";
import {
  AnonymousIdUserPropertyDefinition,
  BackendMessageSendResult,
  BroadcastResourceV2,
  BroadcastV2Config,
  ChannelType,
  EmailProviderType,
  EmailTemplateResource,
  IdUserPropertyDefinition,
  InternalEventType,
  MessageEmailServiceFailure,
  MessageSendSuccess,
  MessageTemplate,
  SubscriptionGroupType,
  TraitUserPropertyDefinition,
  UserProperty,
  UserPropertyDefinitionType,
  Workspace,
} from "../types";
import { insertUserPropertyAssignments } from "../userProperties";
import { createWorkspace } from "../workspaces";
import { getBroadcast, sendMessagesFactory } from "./activities";
import {
  broadcastWorkflowV2,
  BroadcastWorkflowV2Params,
  generateBroadcastWorkflowV2Id,
  pauseBroadcastSignal,
  resumeBroadcastSignal,
} from "./broadcastWorkflowV2";

const successMessageSentResult: MessageSendSuccess = {
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
    },
  },
};

type Trigger<T> = (value: T | PromiseLike<T>) => void;

function buildManuallyTriggered<T = void>() {
  let trigger!: Trigger<T>;

  // Create the promise, and capture its resolve function
  const triggeredPromise = new Promise<T>((resolve) => {
    // Assign the promise's resolve capability to the external variable
    trigger = resolve;
  });

  // Return the promise and the function that can trigger its resolution
  return {
    triggeredPromise,
    trigger,
  };
}

jest.setTimeout(15000);

describe("broadcastWorkflowV2", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;
  let broadcast: BroadcastResourceV2;
  let idUserProperty: UserProperty;
  let emailUserProperty: UserProperty;
  let anonymousIdProprty: UserProperty;
  let subscriptionGroupId: string;
  let messageTemplate: MessageTemplate;
  let senderMock: jest.Mock;

  beforeEach(async () => {
    workspace = await createWorkspace({
      name: `broadcast-workflow-v2-${randomUUID()}`,
    }).then(unwrap);

    idUserProperty = await insert({
      table: schema.userProperty,
      values: {
        name: "id",
        workspaceId: workspace.id,
        definition: {
          type: UserPropertyDefinitionType.Id,
        } satisfies IdUserPropertyDefinition,
      },
    }).then(unwrap);

    emailUserProperty = await insert({
      table: schema.userProperty,
      values: {
        name: "email",
        workspaceId: workspace.id,
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "email",
        } satisfies TraitUserPropertyDefinition,
      },
    }).then(unwrap);

    anonymousIdProprty = await insert({
      table: schema.userProperty,
      values: {
        name: "anonymousId",
        workspaceId: workspace.id,
        definition: {
          type: UserPropertyDefinitionType.AnonymousId,
        } satisfies AnonymousIdUserPropertyDefinition,
      },
    }).then(unwrap);

    subscriptionGroupId = randomUUID();
    await upsertSubscriptionGroup({
      id: subscriptionGroupId,
      name: "default",
      workspaceId: workspace.id,
      type: SubscriptionGroupType.OptIn,
      channel: "Email",
    }).then(unwrap);

    messageTemplate = await insert({
      table: schema.messageTemplate,
      values: {
        workspaceId: workspace.id,
        name: `template-${randomUUID()}`,
        definition: {
          type: ChannelType.Email,
          from: "support@company.com",
          subject: "Hello",
          body: "{% unsubscribe_link here %}.",
        } satisfies EmailTemplateResource,
      },
    }).then(unwrap);
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  async function createBroadcast({
    config,
    scheduledAt,
  }: {
    config: BroadcastV2Config;
    scheduledAt?: string;
  }) {
    const dbBroadcast = await insert({
      table: schema.broadcast,
      values: {
        id: randomUUID(),
        workspaceId: workspace.id,
        name: "test-broadcast",
        statusV2: "Draft",
        version: "V2",
        messageTemplateId: messageTemplate.id,
        scheduledAt,
        subscriptionGroupId,
        config,
      },
    }).then(unwrap);

    broadcast = broadcastV2ToResource(dbBroadcast);
  }

  async function createTestEnvAndWorker({
    sendMessageOverride,
  }: {
    sendMessageOverride?: (
      params: SendMessageParameters,
    ) => Promise<BackendMessageSendResult>;
  } = {}) {
    const sendMessageImplementation =
      sendMessageOverride ??
      (() => Promise.resolve(ok(successMessageSentResult)));
    senderMock = jest.fn().mockImplementation(sendMessageImplementation);
    const testActivities = {
      sendMessages: sendMessagesFactory(senderMock),
    };

    const envAndWorker = await createEnvAndWorker({
      activityOverrides: testActivities,
    });
    testEnv = envAndWorker.testEnv;
    worker = envAndWorker.worker;
  }

  describe.only("when sending a broadcast immediately with no rate limit", () => {
    let userId: string;
    let userId2: string;
    let anonymousUserId: string;

    beforeEach(async () => {
      await createTestEnvAndWorker();
      anonymousUserId = randomUUID();
      userId = randomUUID();
      userId2 = randomUUID();

      await createBroadcast({
        config: {
          type: "V2",
          message: {
            type: ChannelType.Email,
          },
        },
      });
      await insertUserPropertyAssignments([
        {
          workspaceId: workspace.id,
          userId,
          userPropertyId: idUserProperty.id,
          value: userId,
        },
        {
          workspaceId: workspace.id,
          userId,
          userPropertyId: emailUserProperty.id,
          value: "test@test.com",
        },
        {
          workspaceId: workspace.id,
          userId: userId2,
          userPropertyId: idUserProperty.id,
          value: userId2,
        },
        {
          workspaceId: workspace.id,
          userId: userId2,
          userPropertyId: emailUserProperty.id,
          value: "test2@test.com",
        },
        {
          workspaceId: workspace.id,
          userId: anonymousUserId,
          userPropertyId: anonymousIdProprty.id,
          value: anonymousUserId,
        },
        {
          workspaceId: workspace.id,
          userId: anonymousUserId,
          userPropertyId: emailUserProperty.id,
          value: "test3@test.com",
        },
      ]);
      await updateUserSubscriptions({
        workspaceId: workspace.id,
        userUpdates: [
          {
            userId,
            changes: {
              [subscriptionGroupId]: true,
            },
          },
        ],
      });
      await updateUserSubscriptions({
        workspaceId: workspace.id,
        userUpdates: [
          {
            userId: anonymousUserId,
            changes: {
              [subscriptionGroupId]: true,
            },
          },
        ],
      });
    });
    it("should send messages to all users immediately", async () => {
      await worker.runUntil(async () => {
        await testEnv.client.workflow.execute(broadcastWorkflowV2, {
          workflowId: generateBroadcastWorkflowV2Id({
            workspaceId: workspace.id,
            broadcastId: broadcast.id,
          }),
          taskQueue: "default",
          args: [
            {
              workspaceId: workspace.id,
              broadcastId: broadcast.id,
            } satisfies BroadcastWorkflowV2Params,
          ],
        });
      });
      expect(senderMock).toHaveBeenCalledTimes(2);
      expect(senderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
        }),
      );
      expect(senderMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          userId: userId2,
        }),
      );
      const deliveries = await searchDeliveries({
        workspaceId: workspace.id,
        broadcastId: broadcast.id,
      });
      expect(deliveries.items).toHaveLength(2);
      expect(
        deliveries.items.find((d) => d.userId === anonymousUserId),
      ).toEqual(
        expect.objectContaining({
          userId: anonymousUserId,
          isAnonymous: true,
        }),
      );
    });
  });
  describe("when sending a broadcast immediately with a rate limit", () => {
    describe("when the broadcast is paused and resumed", () => {
      let userIds: string[];
      let firstMessageTrigger: Trigger<void>;
      let firstMessagePromise: Promise<void>;

      beforeEach(async () => {
        const manuallyTriggered = buildManuallyTriggered();
        firstMessagePromise = manuallyTriggered.triggeredPromise;
        firstMessageTrigger = manuallyTriggered.trigger;

        await createTestEnvAndWorker({
          sendMessageOverride: () => {
            firstMessageTrigger();
            return Promise.resolve(ok(successMessageSentResult));
          },
        });
        await createBroadcast({
          config: {
            type: "V2",
            message: { type: ChannelType.Email },
            batchSize: 1,
            rateLimit: 1,
          },
        });
        userIds = times(100, (i) => `user-${i}`);
        const assignments = userIds.flatMap((userId, i) => [
          {
            workspaceId: workspace.id,
            userId,
            userPropertyId: idUserProperty.id,
            value: userId,
          },
          {
            workspaceId: workspace.id,
            userId,
            userPropertyId: emailUserProperty.id,
            value: `test${i}@test.com`,
          },
        ]);
        await insertUserPropertyAssignments(assignments);
        const userUpdates = userIds.map((userId) => ({
          userId,
          changes: {
            [subscriptionGroupId]: true,
          },
        }));

        await updateUserSubscriptions({
          workspaceId: workspace.id,
          userUpdates,
        });
      });
      it("should stop sending messages until the broadcast is resumed", async () => {
        await worker.runUntil(async () => {
          const handle = await testEnv.client.workflow.start(
            broadcastWorkflowV2,
            {
              workflowId: generateBroadcastWorkflowV2Id({
                workspaceId: workspace.id,
                broadcastId: broadcast.id,
              }),
              taskQueue: "default",
              args: [
                {
                  workspaceId: workspace.id,
                  broadcastId: broadcast.id,
                } satisfies BroadcastWorkflowV2Params,
              ],
            },
          );
          // wait for the first message to be sent
          await firstMessagePromise;

          expect(
            senderMock,
            "should have sent 1 message initially",
          ).toHaveBeenCalledTimes(1);

          await testEnv.sleep(1500);
          expect(
            senderMock,
            "should have sent 2 messages after waiting for one rate limit period",
          ).toHaveBeenCalledTimes(2);

          await handle.signal(pauseBroadcastSignal);
          await testEnv.sleep(5000);
          expect(
            senderMock,
            "should not have sent any more messages while paused",
          ).toHaveBeenCalledTimes(2);

          await handle.signal(resumeBroadcastSignal);
          await handle.result();
          expect(senderMock).toHaveBeenCalledTimes(userIds.length);
        });
      });
    });
  });
  describe("when a broadcast receives a non-retryable error and is configured to pause on error", () => {
    let shouldError: boolean;
    let userId1: string;
    let userId2: string;
    beforeEach(async () => {
      shouldError = true;
      userId1 = randomUUID();
      userId2 = randomUUID();

      await createTestEnvAndWorker({
        sendMessageOverride: () => {
          if (shouldError) {
            return Promise.resolve(
              err({
                type: InternalEventType.MessageFailure,
                variant: {
                  type: ChannelType.Email,
                  provider: {
                    type: EmailProviderType.SendGrid,
                    status: 403,
                    body: "missing permissions",
                  },
                } satisfies MessageEmailServiceFailure,
              }),
            );
          }
          return Promise.resolve(ok(successMessageSentResult));
        },
      });
      await createBroadcast({
        config: {
          type: "V2",
          message: { type: ChannelType.Email },
          errorHandling: "PauseOnError",
          batchSize: 1,
        },
      });

      await insertUserPropertyAssignments([
        {
          workspaceId: workspace.id,
          userId: userId1,
          userPropertyId: idUserProperty.id,
          value: userId1,
        },
        {
          workspaceId: workspace.id,
          userId: userId1,
          userPropertyId: emailUserProperty.id,
          value: "test@test.com",
        },
        {
          workspaceId: workspace.id,
          userId: userId2,
          userPropertyId: idUserProperty.id,
          value: userId2,
        },
        {
          workspaceId: workspace.id,
          userId: userId2,
          userPropertyId: emailUserProperty.id,
          value: "test2@test.com",
        },
      ]);

      await updateUserSubscriptions({
        workspaceId: workspace.id,
        userUpdates: [
          { userId: userId1, changes: { [subscriptionGroupId]: true } },
          { userId: userId2, changes: { [subscriptionGroupId]: true } },
        ],
      });
    });
    it("should be paused until the broadcast is resumed", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(
          broadcastWorkflowV2,
          {
            workflowId: generateBroadcastWorkflowV2Id({
              workspaceId: workspace.id,
              broadcastId: broadcast.id,
            }),
            taskQueue: "default",
            args: [
              {
                workspaceId: workspace.id,
                broadcastId: broadcast.id,
              } satisfies BroadcastWorkflowV2Params,
            ],
          },
        );
        await testEnv.sleep(10000);
        expect(senderMock).toHaveBeenCalledTimes(1);

        let deliveries = await searchDeliveries({
          workspaceId: workspace.id,
          broadcastId: broadcast.id,
        });
        expect(deliveries.items).toHaveLength(0);

        let updatedBroadcast = await getBroadcast({
          workspaceId: workspace.id,
          broadcastId: broadcast.id,
        });
        expect(updatedBroadcast?.status).toBe("Paused");

        shouldError = false;
        await handle.signal(resumeBroadcastSignal);

        await handle.result();

        updatedBroadcast = await getBroadcast({
          workspaceId: workspace.id,
          broadcastId: broadcast.id,
        });
        expect(updatedBroadcast?.status).toBe("Completed");

        deliveries = await searchDeliveries({
          workspaceId: workspace.id,
          broadcastId: broadcast.id,
        });
        expect(deliveries.items).toHaveLength(1);
      });
    });
  });

  describe("when a broadcast receives a non-retryable error and is configured to skip on error", () => {
    let shouldError: boolean;
    let userId1: string;
    let userId2: string;
    beforeEach(async () => {
      shouldError = true;
      userId1 = randomUUID();
      userId2 = randomUUID();

      await createTestEnvAndWorker({
        sendMessageOverride: (params) => {
          if (shouldError && params.userId === userId1) {
            return Promise.resolve(
              err({
                type: InternalEventType.MessageFailure,
                variant: {
                  type: ChannelType.Email,
                  provider: {
                    type: EmailProviderType.SendGrid,
                    status: 403,
                    body: "missing permissions",
                  },
                } satisfies MessageEmailServiceFailure,
              }),
            );
          }
          return Promise.resolve(ok(successMessageSentResult));
        },
      });
      await createBroadcast({
        config: {
          type: "V2",
          message: { type: ChannelType.Email },
          errorHandling: "SkipOnError",
          batchSize: 1,
        },
      });

      await insertUserPropertyAssignments([
        {
          workspaceId: workspace.id,
          userId: userId1,
          userPropertyId: idUserProperty.id,
          value: userId1,
        },
        {
          workspaceId: workspace.id,
          userId: userId1,
          userPropertyId: emailUserProperty.id,
          value: "test@test.com",
        },
        {
          workspaceId: workspace.id,
          userId: userId2,
          userPropertyId: idUserProperty.id,
          value: userId2,
        },
        {
          workspaceId: workspace.id,
          userId: userId2,
          userPropertyId: emailUserProperty.id,
          value: "test2@test.com",
        },
      ]);

      await updateUserSubscriptions({
        workspaceId: workspace.id,
        userUpdates: [
          { userId: userId1, changes: { [subscriptionGroupId]: true } },
          { userId: userId2, changes: { [subscriptionGroupId]: true } },
        ],
      });
    });
    it("should skip the message to the user", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(
          broadcastWorkflowV2,
          {
            workflowId: generateBroadcastWorkflowV2Id({
              workspaceId: workspace.id,
              broadcastId: broadcast.id,
            }),
            taskQueue: "default",
            args: [
              {
                workspaceId: workspace.id,
                broadcastId: broadcast.id,
              } satisfies BroadcastWorkflowV2Params,
            ],
          },
        );
        await handle.result();
        expect(senderMock).toHaveBeenCalledTimes(2);

        let deliveries = await searchDeliveries({
          workspaceId: workspace.id,
          broadcastId: broadcast.id,
        });
        expect(deliveries.items).toHaveLength(1);
      });
    });
  });
  describe("when sending a broadcast with a scheduled time", () => {
    describe("when just using a default timezone", () => {
      let userId: string;
      let scheduledAt: string;
      let timeZone: string;

      beforeEach(async () => {
        userId = randomUUID();

        await createTestEnvAndWorker();
        timeZone = "America/New_York";
        const currentYear = new Date().getFullYear();
        // Test will fail after this date.
        scheduledAt = `${currentYear + 1}-01-01 08:00`;

        await createBroadcast({
          scheduledAt,
          config: {
            type: "V2",
            message: { type: ChannelType.Email },
            defaultTimezone: timeZone,
          },
        });

        await insertUserPropertyAssignments([
          {
            workspaceId: workspace.id,
            userId,
            userPropertyId: idUserProperty.id,
            value: userId,
          },
          {
            workspaceId: workspace.id,
            userId,
            userPropertyId: emailUserProperty.id,
            value: "test@test.com",
          },
        ]);
        await updateUserSubscriptions({
          workspaceId: workspace.id,
          userUpdates: [{ userId, changes: { [subscriptionGroupId]: true } }],
        });
      });
      it("should localize the delivery time to that default timezone", async () => {
        await worker.runUntil(async () => {
          const handle = await testEnv.client.workflow.start(
            broadcastWorkflowV2,
            {
              workflowId: generateBroadcastWorkflowV2Id({
                workspaceId: workspace.id,
                broadcastId: broadcast.id,
              }),
              taskQueue: "default",
              args: [
                {
                  workspaceId: workspace.id,
                  broadcastId: broadcast.id,
                } satisfies BroadcastWorkflowV2Params,
              ],
            },
          );

          await testEnv.sleep(1000);
          expect(senderMock).toHaveBeenCalledTimes(0);

          await handle.result();
          await testEnv.sleep(0);
        });

        const deliveries = await searchDeliveries({
          workspaceId: workspace.id,
          broadcastId: broadcast.id,
        });

        expect(deliveries.items).toHaveLength(1);
        expect(deliveries.items[0]?.userId).toEqual(userId);
        const sentAt = new Date(deliveries.items[0]?.sentAt ?? 0);
        const utcScheduledAt = zonedTimeToUtc(scheduledAt, timeZone);
        const difference = sentAt.getTime() - utcScheduledAt.getTime();
        expect(difference).toBeLessThan(1000);
      });
    });
    describe.skip("when using individual timezones", () => {
      it("should localize the delivery time for each user", async () => {});

      describe("when using a rate limit", () => {
        it("should send messages to all users at the specified rate within each timezone", async () => {});
      });
    });
  });
});
