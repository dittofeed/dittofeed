import { randomUUID } from "node:crypto";

import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ok } from "neverthrow";

import { createEnvAndWorker } from "../../test/temporal";
import { broadcastV2ToResource } from "../broadcasts";
import { insert } from "../db";
import * as schema from "../db/schema";
import { upsertSubscriptionGroup } from "../subscriptionGroups";
import {
  BroadcastResourceV2,
  BroadcastV2Config,
  ChannelType,
  EmailProviderType,
  EmailTemplateResource,
  IdUserPropertyDefinition,
  InternalEventType,
  SubscriptionGroupType,
  TraitUserPropertyDefinition,
  UserProperty,
  UserPropertyDefinitionType,
  Workspace,
} from "../types";
import { insertUserPropertyAssignments } from "../userProperties";
import { createWorkspace } from "../workspaces";
import { sendMessagesFactory } from "./activities";
import {
  broadcastWorkflowV2,
  BroadcastWorkflowV2Params,
  generateBroadcastWorkflowV2Id,
} from "./broadcastWorkflowV2";

jest.setTimeout(15000);

describe("broadcastWorkflowV2", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;
  let broadcast: BroadcastResourceV2;
  let idUserProperty: UserProperty;
  let emailUserProperty: UserProperty;

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
        },
      },
    }),
  );
  const testActivities = {
    sendMessages: sendMessagesFactory(senderMock),
  };

  beforeEach(async () => {
    workspace = await createWorkspace({
      name: `broadcast-workflow-v2-${randomUUID()}`,
    }).then(unwrap);

    const envAndWorker = await createEnvAndWorker({
      activityOverrides: testActivities,
    });
    testEnv = envAndWorker.testEnv;
    worker = envAndWorker.worker;

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
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  describe("when sending a broadcast immediately with no rate limit", () => {
    let templateId: string;
    let subscriptionGroupId: string;
    let userId: string;
    let anonymousUserId: string;

    beforeEach(async () => {
      templateId = randomUUID();
      subscriptionGroupId = randomUUID();
      anonymousUserId = randomUUID();
      userId = randomUUID();

      await upsertSubscriptionGroup({
        id: subscriptionGroupId,
        name: "default",
        workspaceId: workspace.id,
        type: SubscriptionGroupType.OptIn,
        channel: "Email",
      }).then(unwrap);

      const messageTemplate = await insert({
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

      const dbBroadcast = await insert({
        table: schema.broadcast,
        values: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: "test-broadcast",
          statusV2: "Draft",
          version: "V2",
          messageTemplateId: messageTemplate.id,
          config: {
            type: "V2",
          } satisfies BroadcastV2Config,
        },
      }).then(unwrap);

      broadcast = broadcastV2ToResource(dbBroadcast);

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
      expect(senderMock).toHaveBeenCalledTimes(1);
      // FIXME
      // add an anonymous user and check that they were sent a message with the track event submitted under their anonymous id
      // add a second user who is unsubscribed and check that they are not sent a message
    });
  });
  describe("when sending a broadcast immediately with a rate limit", () => {
    it("should send message to all users at the specified rate", async () => {
      // use test env sleep to test rate limiting
    });

    describe("when the broadcast is paused", () => {
      it("should stop sending messages", async () => {
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
