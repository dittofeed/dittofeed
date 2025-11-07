import { randomUUID } from "crypto";
import { ok } from "neverthrow";

import { submitBatch } from "../../apps/batch";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { upsertJourney } from "../../journeys";
import logger from "../../logger";
import {
  ChannelType,
  EmailProviderType,
  EventType,
  InternalEventType,
  JourneyNodeType,
  JourneyStatus,
  UserPropertyDefinitionType,
} from "../../types";
import {
  insertUserPropertyAssignments,
  upsertUserProperty,
} from "../../userProperties";
import { sendMessageFactory } from "./activities";

describe("user workflows activity test", () => {
  let workspaceId: string;
  let user1Id: string;
  let emailUserPropertyId: string;
  let idUserPropertyId: string;

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
  beforeEach(async () => {
    workspaceId = randomUUID();
    user1Id = randomUUID();
    emailUserPropertyId = randomUUID();
    idUserPropertyId = randomUUID();
    await db()
      .insert(schema.workspace)
      .values({
        id: workspaceId,
        name: `user-workflow-activity-test-${workspaceId}`,
      });
    await Promise.all([
      upsertUserProperty(
        {
          workspaceId,
          name: "id",
          id: idUserPropertyId,
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
        {
          skipProtectedCheck: true,
        },
      ),
      upsertUserProperty(
        {
          workspaceId,
          name: "email",
          id: emailUserPropertyId,
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
        {
          skipProtectedCheck: true,
        },
      ),
    ]);
  });
  describe("sendMessageFactory", () => {
    describe("with events in context", () => {
      let eventId: string;
      let templateId: string;
      let journeyId: string;
      beforeEach(async () => {
        eventId = randomUUID();
        templateId = randomUUID();
        journeyId = randomUUID();
        await upsertUserProperty({
          workspaceId,
          name: "AnyOf",
          definition: {
            type: UserPropertyDefinitionType.Group,
            entry: "0",
            nodes: [
              {
                id: "0",
                type: UserPropertyDefinitionType.AnyOf,
                children: ["1", "2"],
              },
              {
                id: "1",
                type: UserPropertyDefinitionType.Performed,
                event: "test1",
                path: "path1",
              },
              {
                id: "2",
                type: UserPropertyDefinitionType.Performed,
                event: "test2",
                path: "path2",
              },
            ],
          },
        });
        await submitBatch({
          workspaceId,
          data: {
            batch: [
              {
                type: EventType.Track,
                userId: randomUUID(),
                messageId: eventId,
                event: "test2",
                properties: {
                  path2: "value2",
                },
                timestamp: new Date().toISOString(),
              },
            ],
          },
        });
        await insertUserPropertyAssignments([
          {
            workspaceId,
            userId: user1Id,
            userPropertyId: emailUserPropertyId,
            value: "test@test.com",
          },
          {
            workspaceId,
            userId: user1Id,
            userPropertyId: idUserPropertyId,
            value: user1Id,
          },
        ]);
        await upsertJourney({
          workspaceId,
          id: journeyId,
          name: "AnyOf Performed",
          status: "Running",
          definition: {
            entryNode: {
              type: JourneyNodeType.EventEntryNode,
              event: "event*",
              child: "message-1",
            },
            nodes: [
              {
                id: "message-1",
                type: JourneyNodeType.MessageNode,
                variant: {
                  type: ChannelType.Email,
                  templateId,
                },
                child: "exit-node",
              },
            ],
            exitNode: {
              type: JourneyNodeType.ExitNode,
            },
          },
        });
      });

      it("should calculate AnyOf Performed user properties", async () => {
        const sendMessage = sendMessageFactory(senderMock);
        const result = await sendMessage({
          journeyId,
          workspaceId,
          userId: user1Id,
          messageId: randomUUID(),
          runId: randomUUID(),
          nodeId: randomUUID(),
          channel: ChannelType.Email,
          templateId,
          eventIds: [eventId],
        });
        expect(result, "message to be sent").toBe(true);

        logger().debug(
          {
            calls: senderMock.mock.calls,
          },
          "senderMock calls",
        );
        expect(
          senderMock.mock.calls.filter(
            (call) =>
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              call[0].userPropertyAssignments?.AnyOf === "value2",
          ),
          "should have sent a message with the AnyOf user property calculated from the events",
        ).toHaveLength(1);
      });
    });
  });
});
