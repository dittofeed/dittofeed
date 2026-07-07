import { findSegmentResources } from "../segments";
import {
  EventType,
  RelationalOperators,
  SavedSegmentResource,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentStatusEnum,
} from "../types";
import { clearRealtimeSegmentDependencyCache } from "./dependencies";
import {
  buildRealtimeSegmentEvalJobs,
  enqueueRealtimeSegmentEvalJobs,
} from "./enqueue";
import { getRealtimeSegmentQueue } from "./queue";
import { RealtimeSegmentEvalJob } from "./types";

jest.mock("./queue", () => ({
  getRealtimeSegmentQueue: jest.fn(),
}));

jest.mock("../segments", () => ({
  findSegmentResources: jest.fn(),
}));

const mockEnqueue = jest.fn<Promise<void>, [RealtimeSegmentEvalJob[]]>(() =>
  Promise.resolve(undefined),
);
const mockFindSegmentResources = jest.mocked(findSegmentResources);
const mockGetRealtimeSegmentQueue = jest.mocked(getRealtimeSegmentQueue);

function segment(
  definition: SavedSegmentResource["definition"],
): SavedSegmentResource {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Test segment",
    workspaceId: "00000000-0000-0000-0000-000000000002",
    definition,
    createdAt: 0,
    updatedAt: 0,
    definitionUpdatedAt: 0,
    status: SegmentStatusEnum.Running,
  };
}

function traitSegment(path: string): SavedSegmentResource {
  return segment({
    entryNode: {
      type: SegmentNodeType.Trait,
      id: "trait",
      path,
      operator: {
        type: SegmentOperatorType.Equals,
        value: "gold",
      },
    },
    nodes: [],
  });
}

function performedSegment(event: string): SavedSegmentResource {
  return segment({
    entryNode: {
      type: SegmentNodeType.Performed,
      id: "performed",
      event,
      times: 1,
      timesOperator: RelationalOperators.GreaterThanOrEqual,
    },
    nodes: [],
  });
}

function everyoneSegment(): SavedSegmentResource {
  return segment({
    entryNode: {
      type: SegmentNodeType.Everyone,
      id: "everyone",
    },
    nodes: [],
  });
}

beforeEach(() => {
  clearRealtimeSegmentDependencyCache();
  jest.clearAllMocks();
  mockGetRealtimeSegmentQueue.mockReturnValue({
    enqueue: mockEnqueue,
    claim: jest.fn(),
    markComplete: jest.fn(),
    markFailed: jest.fn(),
  });
});

describe("buildRealtimeSegmentEvalJobs", () => {
  it("builds identify jobs with changed trait paths", () => {
    const jobs = buildRealtimeSegmentEvalJobs({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userEvents: [
        {
          messageId: "identify-message",
          messageRaw: JSON.stringify({
            type: EventType.Identify,
            messageId: "identify-message",
            userId: "user-1",
            traits: {
              email: "user@example.com",
              plan: "gold",
            },
            timestamp: "2026-01-01T00:00:00.000Z",
          }),
        },
      ],
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(
      expect.objectContaining({
        messageId: "identify-message",
        userId: "user-1",
        userOrAnonymousId: "user-1",
        eventType: EventType.Identify,
        traitPaths: ["email", "plan"],
        propertyPaths: [],
      }),
    );
  });

  it("builds track jobs with event and changed property paths", () => {
    const jobs = buildRealtimeSegmentEvalJobs({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userEvents: [
        {
          messageId: "track-message",
          messageRaw: JSON.stringify({
            type: EventType.Track,
            messageId: "track-message",
            userId: "user-1",
            anonymousId: "anon-1",
            event: "Purchase",
            properties: {
              amount: 100,
              currency: "USD",
            },
            timestamp: "2026-01-01T00:00:01.000Z",
          }),
        },
      ],
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(
      expect.objectContaining({
        messageId: "track-message",
        userId: "user-1",
        anonymousId: "anon-1",
        userOrAnonymousId: "user-1",
        eventType: EventType.Track,
        event: "Purchase",
        traitPaths: [],
        propertyPaths: ["amount", "currency"],
      }),
    );
  });

  it("skips anonymous-only track events", () => {
    const jobs = buildRealtimeSegmentEvalJobs({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userEvents: [
        {
          messageId: "anonymous-track-message",
          messageRaw: JSON.stringify({
            type: EventType.Track,
            messageId: "anonymous-track-message",
            anonymousId: "anon-1",
            event: "Purchase",
            properties: {
              amount: 100,
            },
          }),
        },
      ],
    });

    expect(jobs).toEqual([]);
  });

  it("skips anonymous-only identify events", () => {
    const jobs = buildRealtimeSegmentEvalJobs({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userEvents: [
        {
          messageId: "anonymous-identify-message",
          messageRaw: JSON.stringify({
            type: EventType.Identify,
            messageId: "anonymous-identify-message",
            anonymousId: "anon-1",
            traits: {
              plan: "gold",
            },
          }),
        },
      ],
    });

    expect(jobs).toEqual([]);
  });

  it("skips events without a user identifier", () => {
    const jobs = buildRealtimeSegmentEvalJobs({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userEvents: [
        {
          messageId: "bad-message",
          messageRaw: JSON.stringify({
            type: EventType.Track,
            messageId: "bad-message",
            event: "Purchase",
          }),
        },
      ],
    });

    expect(jobs).toEqual([]);
  });
});

describe("enqueueRealtimeSegmentEvalJobs", () => {
  it("does not enqueue anonymous-only realtime jobs", async () => {
    await enqueueRealtimeSegmentEvalJobs({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userEvents: [
        {
          messageId: "anonymous-track-message",
          messageRaw: JSON.stringify({
            type: EventType.Track,
            messageId: "anonymous-track-message",
            anonymousId: "anon-1",
            event: "Purchase",
          }),
        },
      ],
    });

    expect(mockFindSegmentResources).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("does not enqueue identify jobs that cannot affect any segment", async () => {
    mockFindSegmentResources.mockResolvedValue([traitSegment("plan")]);

    await enqueueRealtimeSegmentEvalJobs({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userEvents: [
        {
          messageId: "identify-message",
          messageRaw: JSON.stringify({
            type: EventType.Identify,
            messageId: "identify-message",
            userId: "user-1",
            traits: {
              email: "user@example.com",
            },
          }),
        },
      ],
    });

    expect(mockFindSegmentResources).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("enqueues identify jobs that affect trait-dependent segments", async () => {
    mockFindSegmentResources.mockResolvedValue([traitSegment("plan")]);

    await enqueueRealtimeSegmentEvalJobs({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userEvents: [
        {
          messageId: "identify-message",
          messageRaw: JSON.stringify({
            type: EventType.Identify,
            messageId: "identify-message",
            userId: "user-1",
            traits: {
              plan: "gold",
            },
          }),
        },
      ],
    });

    expect(mockEnqueue).toHaveBeenCalledWith([
      expect.objectContaining({
        messageId: "identify-message",
        traitPaths: ["plan"],
      }),
    ]);
  });

  it("enqueues track jobs that affect event-dependent segments", async () => {
    mockFindSegmentResources.mockResolvedValue([performedSegment("Purchase")]);

    await enqueueRealtimeSegmentEvalJobs({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userEvents: [
        {
          messageId: "track-message",
          messageRaw: JSON.stringify({
            type: EventType.Track,
            messageId: "track-message",
            userId: "user-1",
            event: "Purchase",
          }),
        },
      ],
    });

    expect(mockEnqueue).toHaveBeenCalledWith([
      expect.objectContaining({
        messageId: "track-message",
        event: "Purchase",
      }),
    ]);
  });

  it("enqueues jobs when an always-dependent segment exists", async () => {
    mockFindSegmentResources.mockResolvedValue([everyoneSegment()]);

    await enqueueRealtimeSegmentEvalJobs({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userEvents: [
        {
          messageId: "identify-message",
          messageRaw: JSON.stringify({
            type: EventType.Identify,
            messageId: "identify-message",
            userId: "user-1",
            traits: {},
          }),
        },
      ],
    });

    expect(mockEnqueue).toHaveBeenCalledWith([
      expect.objectContaining({
        messageId: "identify-message",
      }),
    ]);
  });

  it("uses the in-memory dependency cache for repeated workspace enqueues", async () => {
    mockFindSegmentResources.mockResolvedValue([traitSegment("plan")]);

    const workspaceId = "00000000-0000-0000-0000-000000000001";
    await enqueueRealtimeSegmentEvalJobs({
      workspaceId,
      userEvents: [
        {
          messageId: "first-identify",
          messageRaw: JSON.stringify({
            type: EventType.Identify,
            messageId: "first-identify",
            userId: "user-1",
            traits: { plan: "gold" },
          }),
        },
      ],
    });
    await enqueueRealtimeSegmentEvalJobs({
      workspaceId,
      userEvents: [
        {
          messageId: "second-identify",
          messageRaw: JSON.stringify({
            type: EventType.Identify,
            messageId: "second-identify",
            userId: "user-1",
            traits: { plan: "silver" },
          }),
        },
      ],
    });

    expect(mockFindSegmentResources).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });
});
