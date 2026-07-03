import {
  JourneyNodeType,
  SavedSegmentResource,
  SegmentNodeType,
  SegmentStatusEnum,
} from "../types";

const mockSignal = jest.fn();
const mockSignalWithStart = jest.fn();
const mockGetHandle = jest.fn(() => ({ signal: mockSignal }));
const mockInsertProcessedComputedProperties = jest.fn(() =>
  Promise.resolve(undefined),
);
const mockClickHouseInsert = jest.fn(() => Promise.resolve(undefined));
let triggerRealtimeSegmentJourneys: (typeof import("./triggers"))["triggerRealtimeSegmentJourneys"];

jest.mock("../temporal/connectWorkflowClient", () => ({
  __esModule: true,
  default: jest.fn(() =>
    Promise.resolve({
      getHandle: mockGetHandle,
      signalWithStart: mockSignalWithStart,
    }),
  ),
}));

jest.mock("../journeys", () => ({
  findSubscribedRunningJourneysForSegment: jest.fn(() =>
    Promise.resolve([
      {
        id: "journey-1",
        name: "Event journey with wait for segment",
        journeyType: "Marketing",
        definition: {
          entryNode: {
            type: JourneyNodeType.EventEntryNode,
            event: "Account Created",
            child: "wait-for-segment",
          },
          nodes: [],
        },
      },
    ]),
  ),
}));

jest.mock("../userEvents/clickhouse", () => ({
  insertProcessedComputedProperties: mockInsertProcessedComputedProperties,
}));

jest.mock("../clickhouse", () => ({
  clickhouseClient: jest.fn(() => ({
    insert: mockClickHouseInsert,
  })),
}));

describe("triggerRealtimeSegmentJourneys", () => {
  beforeAll(async () => {
    ({ triggerRealtimeSegmentJourneys } = await import("./triggers"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("signals existing non-entry journey workflows without starting them", async () => {
    const assignedAt = new Date("2026-01-01T00:00:00.000Z");
    const segment: SavedSegmentResource = {
      id: "segment-1",
      name: "Realtime segment",
      workspaceId: "workspace-1",
      status: SegmentStatusEnum.Running,
      createdAt: 0,
      updatedAt: 0,
      definitionUpdatedAt: 0,
      definition: {
        entryNode: {
          type: SegmentNodeType.Everyone,
          id: "everyone",
        },
        nodes: [],
      },
    };

    const count = await triggerRealtimeSegmentJourneys({
      segment,
      change: {
        workspaceId: "workspace-1",
        userId: "user-1",
        segmentId: "segment-1",
        inSegment: true,
        maxEventTime: assignedAt,
        assignedAt,
      },
    });

    expect(count).toBe(1);
    expect(mockGetHandle).toHaveBeenCalledWith("user-journey-user-1-journey-1");
    expect(mockSignal).toHaveBeenCalledWith(expect.anything(), {
      segmentId: "segment-1",
      currentlyInSegment: true,
      segmentVersion: assignedAt.getTime(),
      type: "segment",
    });
    expect(mockSignalWithStart).not.toHaveBeenCalled();
    expect(mockInsertProcessedComputedProperties).toHaveBeenCalledWith({
      assignments: [
        expect.objectContaining({
          workspace_id: "workspace-1",
          user_id: "user-1",
          type: "segment",
          computed_property_id: "segment-1",
          segment_value: true,
          processed_for: "journey-1",
          processed_for_type: "journey",
        }),
      ],
    });
  });
});
