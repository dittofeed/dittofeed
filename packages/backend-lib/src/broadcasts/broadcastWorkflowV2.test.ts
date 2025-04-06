import { randomUUID } from "node:crypto";

import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { err, ok } from "neverthrow";

import { createEnvAndWorker } from "../../test/temporal";
import { broadcastV2ToResource } from "../broadcasts";
import { insert } from "../db";
import * as schema from "../db/schema";
import { searchDeliveries } from "../deliveries";
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
} from "./broadcastWorkflowV2";
import { SendMessageParameters } from "../messaging";

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

  async function createBroadcast({ config }: { config: BroadcastV2Config }) {
    const dbBroadcast = await insert({
      table: schema.broadcast,
      values: {
        id: randomUUID(),
        workspaceId: workspace.id,
        name: "test-broadcast",
        statusV2: "Draft",
        version: "V2",
        messageTemplateId: messageTemplate.id,
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
      (() =>
        Promise.resolve(
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
              },
            },
          }),
        ));
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

  describe("when sending a broadcast immediately with no rate limit", () => {
    let userId: string;
    let userId2: string;
    let anonymousUserId: string;

    beforeEach(async () => {
      await createTestEnvAndWorker();
      anonymousUserId = randomUUID();
      userId = randomUUID();

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
    it.only("should send messages to all users immediately", async () => {
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
    it("should send message to all users at the specified rate", async () => {
      // use test env sleep to test rate limiting
    });

    describe("when the broadcast is paused", () => {
      let userId1: string;
      beforeEach(async () => {
        userId1 = randomUUID();

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
        ]);

        await updateUserSubscriptions({
          workspaceId: workspace.id,
          userUpdates: [
            {
              userId: userId1,
              changes: {
                [subscriptionGroupId]: true,
              },
            },
          ],
        });
      });
      it("should stop sending messages until the broadcast is resumed", async () => {
        // start workflow
        // assert subset of messages sent
        // wait for period < rate limit
        // pause broadcast
        // sleep for long period
        // assert no more messages sent
        // retrieve pending messages and expect them to contain the subset of messages that were not sent
        // resume broadcast
        // assert all messages sent
      });
    });
  });
  describe("when a broadcast receives a non-retryable error and is configured to pause on error", () => {
    beforeEach(async () => {
      await createTestEnvAndWorker({
        sendMessageOverride: () =>
          Promise.resolve(
            err({
              type: InternalEventType.MessageFailure,
              variant: {
                type: ChannelType.Email,
                provider: {
                  type: EmailProviderType.Sendgrid,
                  status: 403,
                  body: "missing permissions",
                },
              } satisfies MessageEmailServiceFailure,
            }),
          ),
      });
      await createBroadcast({
        config: {
          type: "V2",
          message: { type: ChannelType.Email },
          errorHandling: "PauseOnError",
        },
      });
    });
    it("should be paused", async () => {
      await worker.runUntil(async () => {
        await testEnv.client.workflow.start(broadcastWorkflowV2, {
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
      expect(senderMock).toHaveBeenCalledTimes(1);
      const deliveries = await searchDeliveries({
        workspaceId: workspace.id,
        broadcastId: broadcast.id,
      });
      expect(deliveries.items).toHaveLength(0);

      const updatedBroadcast = await getBroadcast({
        workspaceId: workspace.id,
        broadcastId: broadcast.id,
      });
      expect(updatedBroadcast?.status).toBe("Paused");
      // test method that exposes errors

      // start workflow
      // assert subset of messages sent
      // send error
      // assert no more messages sent
    });
  });
  describe("when sending a broadcast with a scheduled time", () => {
    describe("when just using a default timezone", () => {
      it("should localize the delivery time to that default timezone", async () => {});
    });
    describe("when using individual timezones", () => {
      it("should localize the delivery time for each user", async () => {});

      describe("when using a rate limit", () => {
        it("should send messages to all users at the specified rate within each timezone", async () => {});
      });
    });
  });
});
