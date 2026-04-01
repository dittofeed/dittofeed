import { WorkflowNotFoundError } from "@temporalio/client";

import { getLinkedAnonymousIdsForKnownUser } from "../identityLinks";
import connectWorkflowClient from "../temporal/connectWorkflowClient";
import { segmentEntryJourneyRunningForLinkedAnonymous } from "./journeyIdentityDedupe";

jest.mock("../temporal/connectWorkflowClient");
jest.mock("../identityLinks", () => ({
  ...jest.requireActual<typeof import("../identityLinks")>("../identityLinks"),
  getLinkedAnonymousIdsForKnownUser: jest.fn(),
}));

const mockGetLinked = getLinkedAnonymousIdsForKnownUser as jest.MockedFunction<
  typeof getLinkedAnonymousIdsForKnownUser
>;
const mockConnect = connectWorkflowClient as jest.MockedFunction<
  typeof connectWorkflowClient
>;

describe("segmentEntryJourneyRunningForLinkedAnonymous", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns false when no linked anonymous ids", async () => {
    mockGetLinked.mockResolvedValue([]);
    await expect(
      segmentEntryJourneyRunningForLinkedAnonymous({
        workspaceId: "w",
        knownUserId: "k",
        journeyId: "j",
      }),
    ).resolves.toBe(false);
  });

  it("returns true when a linked anonymous workflow is RUNNING", async () => {
    mockGetLinked.mockResolvedValue(["anon1"]);
    const describe = jest
      .fn()
      .mockResolvedValue({ status: { name: "RUNNING" } });
    mockConnect.mockResolvedValue({
      getHandle: () => ({ describe }),
    } as never);
    await expect(
      segmentEntryJourneyRunningForLinkedAnonymous({
        workspaceId: "w",
        knownUserId: "k",
        journeyId: "j",
      }),
    ).resolves.toBe(true);
  });

  it("returns false when workflow is not found", async () => {
    mockGetLinked.mockResolvedValue(["anon1"]);
    const describe = jest
      .fn()
      .mockRejectedValue(
        new WorkflowNotFoundError("not found", "wf-id", undefined),
      );
    mockConnect.mockResolvedValue({
      getHandle: () => ({ describe }),
    } as never);
    await expect(
      segmentEntryJourneyRunningForLinkedAnonymous({
        workspaceId: "w",
        knownUserId: "k",
        journeyId: "j",
      }),
    ).resolves.toBe(false);
  });
});
