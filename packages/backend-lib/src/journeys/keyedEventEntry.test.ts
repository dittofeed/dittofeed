import { randomUUID } from "crypto";

import { ChannelType, JourneyDefinition, JourneyNodeType } from "../types";

describe("keyedEventEntry journeys", () => {
  describe("when a journey is keyed on appointmentId and waits for a cancellation event before sending a message", () => {
    beforeEach(async () => {
      const appointmentCancelledSegmentId = randomUUID();
      const templateId = randomUUID();

      const definition: JourneyDefinition = {
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
            timeoutSeconds: 60 * 60 * 24, // 1 day
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
      // create a journey with a wait-for node conditioned on a cancellation event
      // create a journey with a wait-for node conditioned on a cancellation event
    });
    describe("when two journeys are triggered concurrently for the same user with different appointmentIds but only one is cancelled ", () => {
      it("only the cancelled journey should send a message", () => {
        expect(true).toBe(true);
      });
    });
  });
});
