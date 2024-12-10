import { getKeyedUserJourneyWorkflowId } from "./journeys/userWorkflow";
import { JourneyNodeType } from "./types";

describe("userWorkflow", () => {
  describe("getKeyedUserJourneyWorkflowId", () => {
    describe("when the entry node has a key and event has the corresponding key", () => {
      it("the key should be used in the workflow id", () => {
        const workspaceId = "31affc62-50e7-438a-ada5-7a2321f338e1";
        const journeyId = "6000442b-3828-432d-afea-b38bb75c0e4c";
        const workflowId = getKeyedUserJourneyWorkflowId({
          workspaceId,
          userId: "1",
          journeyId,
          entryNode: {
            type: JourneyNodeType.EventEntryNode,
            event: "classRosterBooking.created",
            key: "classRosterBookingId",
            child: JourneyNodeType.ExitNode,
          },
          event: {
            event: "classRosterBooking.created",
            messageId: "1",
            properties: {
              classRosterBookingId: 123,
            },
          },
        });
        expect(workflowId).not.toBeNull();
        expect(workflowId).toContain(workspaceId);
        expect(workflowId).toContain(journeyId);
      });
    });
  });
});
