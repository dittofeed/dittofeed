import { EventType } from "../types";
import { query } from "../clickhouse";
import { readRealtimeUserState } from "./state";
import { RealtimeSegmentEvalJob } from "./types";

jest.mock("../clickhouse", () => {
  const actual = jest.requireActual("../clickhouse");
  return {
    ...actual,
    query: jest.fn(),
  };
});

const mockQuery = query as jest.MockedFunction<typeof query>;

function mockClickHouseRows(rows: unknown[]): void {
  mockQuery.mockResolvedValueOnce({
    json: jest.fn(() => Promise.resolve(rows)),
  } as Awaited<ReturnType<typeof query>>);
}

describe("readRealtimeUserState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters trait reads by user_id when the realtime job has one", async () => {
    mockClickHouseRows([]);
    const job: RealtimeSegmentEvalJob = {
      workspaceId: "workspace-1",
      messageId: "message-1",
      userId: "user-1",
      userOrAnonymousId: "user-1",
      eventType: EventType.Identify,
      traitPaths: ["plan"],
      propertyPaths: [],
      payload: {
        type: EventType.Identify,
        traits: {
          plan: "gold",
        },
      },
      eventTime: new Date("2026-01-01T00:00:00.000Z"),
      processingTime: new Date("2026-01-01T00:00:00.000Z"),
    };

    await readRealtimeUserState({
      workspaceId: "workspace-1",
      userOrAnonymousId: "user-1",
      dependencies: {
        traitPaths: new Set(["plan"]),
        eventNames: new Set(),
        always: false,
      },
      currentJob: job,
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const params = mockQuery.mock.calls[0]?.[0];
    expect(params?.query).toContain("AND user_id =");
    expect(params?.query_params).toEqual(
      expect.objectContaining({
        v0: "user-1",
      }),
    );
  });

  it("keeps the anonymous-id fallback when the realtime job has no user_id", async () => {
    mockClickHouseRows([]);

    await readRealtimeUserState({
      workspaceId: "workspace-1",
      userOrAnonymousId: "anonymous-1",
      dependencies: {
        traitPaths: new Set(["plan"]),
        eventNames: new Set(),
        always: false,
      },
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const params = mockQuery.mock.calls[0]?.[0];
    expect(params?.query).not.toContain("AND user_id =");
    expect(params?.query_params).toEqual(
      expect.objectContaining({
        v0: "workspace-1",
        v1: "anonymous-1",
      }),
    );
  });
});
