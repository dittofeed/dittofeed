import config from "../config";
import { readRealtimeUserState } from "../realtimeSegments/state";
import {
  EventType,
  SavedUserPropertyResource,
  UserPropertyDefinitionType,
} from "../types";
import { clearRealtimeUserPropertyDependencyCache } from "./dependencies";
import { materializeRealtimeUserProperties } from "./materialize";

const mockInsert = jest.fn((_params: { values: Record<string, unknown>[] }) =>
  Promise.resolve(undefined),
);
const mockQuery = jest.fn();
const mockFindAllUserPropertyResources = jest.fn();
const mockReadRealtimeUserState = jest.mocked(readRealtimeUserState);
const mockConfig = jest.mocked(config);

jest.mock("../config", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    computedPropertyAssignmentsCacheEnabled: false,
    computedPropertyAssignmentsCacheTtlSeconds: 300,
    readComputedPropertyAssignmentsFromCurrent: false,
    realtimeSegmentsStateCacheEnabled: false,
    realtimeSegmentsStateCacheMaxEventsPerUserEvent: 5000,
    realtimeSegmentsStateCacheTtlSeconds: 1209600,
    realtimeSegmentsStateCacheUrl: "redis://localhost:6379",
    writeComputedPropertyAssignmentsCurrent: false,
  })),
}));

jest.mock("../clickhouse", () => {
  const actual =
    jest.requireActual<typeof import("../clickhouse")>("../clickhouse");
  return {
    ...actual,
    clickhouseClient: jest.fn(() => ({
      insert: mockInsert,
    })),
    query: mockQuery,
  };
});

jest.mock("../realtimeSegments/state", () => ({
  readRealtimeUserState: jest.fn(),
}));

jest.mock("../userProperties", () => ({
  findAllUserPropertyResources: mockFindAllUserPropertyResources,
}));

function userProperty(
  override: Partial<SavedUserPropertyResource>,
): SavedUserPropertyResource {
  return {
    createdAt: 0,
    definition: {
      path: "plan",
      type: UserPropertyDefinitionType.Trait,
    },
    definitionUpdatedAt: 0,
    id: "up-1",
    name: "plan",
    status: "Running",
    updatedAt: 0,
    workspaceId: "workspace-1",
    ...override,
  };
}

function mockLatestAssignments(rows: unknown[]): void {
  mockQuery.mockResolvedValueOnce({
    json: jest.fn(() => Promise.resolve(rows)),
  });
}

function insertedRows(): Record<string, unknown>[] {
  return mockInsert.mock.calls[0]?.[0].values ?? [];
}

describe("materializeRealtimeUserProperties", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearRealtimeUserPropertyDependencyCache();
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    mockConfig.mockReturnValue({
      computedPropertyAssignmentsCacheEnabled: false,
      computedPropertyAssignmentsCacheTtlSeconds: 300,
      readComputedPropertyAssignmentsFromCurrent: false,
      realtimeSegmentsStateCacheEnabled: false,
      realtimeSegmentsStateCacheMaxEventsPerUserEvent: 5000,
      realtimeSegmentsStateCacheTtlSeconds: 1209600,
      realtimeSegmentsStateCacheUrl: "redis://localhost:6379",
      writeComputedPropertyAssignmentsCurrent: false,
    } as ReturnType<typeof config>);
  });

  it("writes fresh trait assignments from the current identify state", async () => {
    mockFindAllUserPropertyResources.mockResolvedValue([
      userProperty({
        id: "plan-property",
        name: "plan",
      }),
    ]);
    mockReadRealtimeUserState.mockResolvedValue({
      userOrAnonymousId: "user-1",
      traits: { plan: "gold" },
      trackEvents: [],
    });
    mockLatestAssignments([]);

    const result = await materializeRealtimeUserProperties({
      job: {
        eventTime: new Date("2026-01-01T00:00:00.000Z"),
        eventType: EventType.Identify,
        messageId: "identify-1",
        payload: {
          traits: { plan: "gold" },
        },
        userId: "user-1",
        userOrAnonymousId: "user-1",
        workspaceId: "workspace-1",
      },
    });

    expect(result).toEqual({ candidateCount: 1, writtenCount: 1 });
    expect(insertedRows()).toEqual([
      expect.objectContaining({
        computed_property_id: "plan-property",
        type: "user_property",
        user_id: "user-1",
        user_property_value: JSON.stringify("gold"),
      }),
    ]);
  });

  it("writes performed and keyed performed assignments from current track events", async () => {
    mockFindAllUserPropertyResources.mockResolvedValue([
      userProperty({
        definition: {
          event: "Purchase",
          path: "amount",
          type: UserPropertyDefinitionType.Performed,
        },
        id: "performed-property",
        name: "lastAmount",
      }),
      userProperty({
        definition: {
          event: "Purchase",
          key: "orderId",
          path: "amount",
          type: UserPropertyDefinitionType.KeyedPerformed,
        },
        id: "keyed-property",
        name: "keyedAmount",
      }),
    ]);
    mockReadRealtimeUserState.mockResolvedValue({
      userOrAnonymousId: "user-1",
      traits: {},
      trackEvents: [
        {
          event: "Purchase",
          eventTime: new Date("2026-01-01T00:00:00.000Z"),
          messageId: "track-1",
          properties: { amount: 42, orderId: "order-1" },
        },
      ],
    });
    mockLatestAssignments([]);

    await materializeRealtimeUserProperties({
      job: {
        event: "Purchase",
        eventTime: new Date("2026-01-01T00:00:00.000Z"),
        eventType: EventType.Track,
        messageId: "track-1",
        payload: {
          properties: { amount: 42, orderId: "order-1" },
        },
        userId: "user-1",
        userOrAnonymousId: "user-1",
        workspaceId: "workspace-1",
      },
    });

    expect(insertedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          computed_property_id: "performed-property",
          user_property_value: "42",
        }),
        expect.objectContaining({
          computed_property_id: "keyed-property",
          user_property_value: "42",
        }),
      ]),
    );
  });

  it("includes the current event in performedMany assignments", async () => {
    mockFindAllUserPropertyResources.mockResolvedValue([
      userProperty({
        definition: {
          or: [{ event: "Purchase" }],
          type: UserPropertyDefinitionType.PerformedMany,
        },
        id: "performed-many-property",
        name: "purchases",
      }),
    ]);
    mockReadRealtimeUserState.mockResolvedValue({
      userOrAnonymousId: "user-1",
      traits: {},
      trackEvents: [
        {
          event: "Purchase",
          eventTime: new Date("2026-01-01T00:00:00.000Z"),
          messageId: "track-1",
          properties: { amount: 42 },
        },
      ],
    });
    mockLatestAssignments([]);
    mockQuery.mockResolvedValueOnce({
      json: jest.fn(() => Promise.resolve([])),
    });

    await materializeRealtimeUserProperties({
      job: {
        event: "Purchase",
        eventTime: new Date("2026-01-01T00:00:00.000Z"),
        eventType: EventType.Track,
        messageId: "track-1",
        payload: {
          properties: { amount: 42 },
        },
        userId: "user-1",
        userOrAnonymousId: "user-1",
        workspaceId: "workspace-1",
      },
    });

    expect(insertedRows()[0]).toEqual(
      expect.objectContaining({
        computed_property_id: "performed-many-property",
        user_property_value: JSON.stringify([
          {
            event: "Purchase",
            properties: JSON.stringify({ amount: 42 }),
            timestamp: "2026-01-01T00:00:00",
          },
        ]),
      }),
    );
  });

  it("skips stale writes when ClickHouse has a newer assignment", async () => {
    mockFindAllUserPropertyResources.mockResolvedValue([
      userProperty({
        id: "plan-property",
        name: "plan",
      }),
    ]);
    mockReadRealtimeUserState.mockResolvedValue({
      userOrAnonymousId: "user-1",
      traits: { plan: "gold" },
      trackEvents: [],
    });
    mockLatestAssignments([
      {
        computed_property_id: "plan-property",
        last_value: JSON.stringify("platinum"),
        max_event_time: "2026-01-02T00:00:00.000Z",
      },
    ]);

    const result = await materializeRealtimeUserProperties({
      job: {
        eventTime: new Date("2026-01-01T00:00:00.000Z"),
        eventType: EventType.Identify,
        messageId: "identify-1",
        payload: {
          traits: { plan: "gold" },
        },
        userId: "user-1",
        userOrAnonymousId: "user-1",
        workspaceId: "workspace-1",
      },
    });

    expect(result).toEqual({ candidateCount: 1, writtenCount: 0 });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
