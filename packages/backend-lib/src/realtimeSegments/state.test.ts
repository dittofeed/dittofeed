import { query } from "../clickhouse";
import config from "../config";
import { EventType } from "../types";
import { readRealtimeUserState } from "./state";
import {
  RealtimeStateCacheClient,
  RedisValue,
  setRealtimeStateCacheClientForTest,
} from "./stateCache";
import { RealtimeSegmentEvalJob } from "./types";

jest.mock("../config", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    realtimeSegmentsStateCacheEnabled: false,
    realtimeSegmentsStateCacheMaxEventsPerUserEvent: 5000,
    realtimeSegmentsStateCacheTtlSeconds: 1209600,
    realtimeSegmentsStateCacheUrl: "redis://localhost:6379",
  })),
}));

jest.mock("../clickhouse", () => {
  const actual =
    jest.requireActual<typeof import("../clickhouse")>("../clickhouse");
  return {
    ...actual,
    query: jest.fn(),
  };
});

const mockQuery = jest.mocked(query);
const mockConfig = jest.mocked(config);

class FakeStateCacheClient implements RealtimeStateCacheClient {
  hashes = new Map<string, Map<string, string>>();

  zsets = new Map<string, Map<string, number>>();

  failCommands = false;

  close(): void {
    this.hashes.clear();
    this.zsets.clear();
  }

  command(args: string[]): Promise<RedisValue> {
    return Promise.resolve(this.commandSync(args));
  }

  private commandSync(args: string[]): RedisValue {
    if (this.failCommands) {
      throw new Error("cache unavailable");
    }
    const [command, key, ...rest] = args;
    switch (command) {
      case "HGETALL": {
        const hash = this.hashes.get(key ?? "");
        return hash ? [...hash.entries()].flat() : [];
      }
      case "HSET": {
        const hash = this.hashes.get(key ?? "") ?? new Map<string, string>();
        this.hashes.set(key ?? "", hash);
        for (let i = 0; i < rest.length; i += 2) {
          const field = rest[i];
          const value = rest[i + 1];
          if (field !== undefined && value !== undefined) {
            hash.set(field, value);
          }
        }
        return rest.length / 2;
      }
      case "HMGET": {
        const hash = this.hashes.get(key ?? "") ?? new Map<string, string>();
        return rest.map((field) => hash.get(field) ?? null);
      }
      case "HDEL": {
        const hash = this.hashes.get(key ?? "") ?? new Map<string, string>();
        let removed = 0;
        for (const field of rest) {
          if (hash.delete(field)) {
            removed += 1;
          }
        }
        return removed;
      }
      case "ZADD": {
        const zset = this.zsets.get(key ?? "") ?? new Map<string, number>();
        this.zsets.set(key ?? "", zset);
        const member = rest[1];
        if (member !== undefined) {
          zset.set(member, Number(rest[0]));
        }
        return 1;
      }
      case "ZREVRANGEBYSCORE": {
        const zset = this.zsets.get(key ?? "") ?? new Map<string, number>();
        const max = rest[0] === "+inf" ? Infinity : Number(rest[0]);
        const min = rest[1] === "-inf" ? -Infinity : Number(rest[1]);
        const limitIndex = rest.indexOf("LIMIT");
        const offset = limitIndex === -1 ? 0 : Number(rest[limitIndex + 1]);
        const count =
          limitIndex === -1 ? Infinity : Number(rest[limitIndex + 2]);
        return [...zset.entries()]
          .filter(([, score]) => score >= min && score <= max)
          .sort((a, b) => b[1] - a[1])
          .slice(offset, offset + count)
          .map(([member]) => member);
      }
      case "ZRANGEBYSCORE": {
        const zset = this.zsets.get(key ?? "") ?? new Map<string, number>();
        const min = rest[0] === "-inf" ? -Infinity : Number(rest[0]);
        const maxRaw = rest[1] ?? "";
        const exclusive = maxRaw.startsWith("(");
        const max =
          maxRaw === "+inf"
            ? Infinity
            : Number(exclusive ? maxRaw.slice(1) : maxRaw);
        return [...zset.entries()]
          .filter(([, score]) =>
            exclusive
              ? score >= min && score < max
              : score >= min && score <= max,
          )
          .sort((a, b) => a[1] - b[1])
          .map(([member]) => member);
      }
      case "ZRANGE": {
        const zset = this.zsets.get(key ?? "") ?? new Map<string, number>();
        const start = Number(rest[0]);
        const stop = Number(rest[1]);
        return [...zset.entries()]
          .sort((a, b) => a[1] - b[1])
          .slice(start, stop + 1)
          .map(([member]) => member);
      }
      case "ZREMRANGEBYSCORE": {
        const zset = this.zsets.get(key ?? "") ?? new Map<string, number>();
        const maxRaw = rest[1] ?? "";
        const exclusive = maxRaw.startsWith("(");
        const max = Number(exclusive ? maxRaw.slice(1) : maxRaw);
        let removed = 0;
        for (const [member, score] of zset) {
          if (exclusive ? score < max : score <= max) {
            zset.delete(member);
            removed += 1;
          }
        }
        return removed;
      }
      case "ZCARD":
        return this.zsets.get(key ?? "")?.size ?? 0;
      case "ZREMRANGEBYRANK": {
        const zset = this.zsets.get(key ?? "") ?? new Map<string, number>();
        const start = Number(rest[0]);
        const stop = Number(rest[1]);
        const members = [...zset.entries()]
          .sort((a, b) => a[1] - b[1])
          .slice(start, stop + 1)
          .map(([member]) => member);
        for (const member of members) {
          zset.delete(member);
        }
        return members.length;
      }
      case "EXPIRE":
        return 1;
      default:
        throw new Error(`Unsupported fake command ${command ?? ""}`);
    }
  }
}

function mockClickHouseRows(rows: unknown[]): void {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  mockQuery.mockResolvedValueOnce({
    json: jest.fn(() => Promise.resolve(rows)),
  } as unknown as Awaited<ReturnType<typeof query>>);
}

function mockCacheConfig({
  enabled,
  maxEventsPerUserEvent = 5000,
}: {
  enabled: boolean;
  maxEventsPerUserEvent?: number;
}): void {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  mockConfig.mockReturnValue({
    realtimeSegmentsStateCacheEnabled: enabled,
    realtimeSegmentsStateCacheMaxEventsPerUserEvent: maxEventsPerUserEvent,
    realtimeSegmentsStateCacheTtlSeconds: 1209600,
    realtimeSegmentsStateCacheUrl: "redis://localhost:6379",
  } as ReturnType<typeof config>);
}

function enableStateCache(fakeClient: FakeStateCacheClient): void {
  mockCacheConfig({ enabled: true });
  setRealtimeStateCacheClientForTest(fakeClient);
}

describe("readRealtimeUserState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheConfig({ enabled: false });
    setRealtimeStateCacheClientForTest(null);
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
        eventWindowSeconds: new Map(),
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
        eventWindowSeconds: new Map(),
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

  it("reads realtime state from cache without querying ClickHouse", async () => {
    const fakeClient = new FakeStateCacheClient();
    enableStateCache(fakeClient);
    await fakeClient.command([
      "HSET",
      "rt:workspace-1:user:user-1:meta",
      "traitPaths",
      JSON.stringify(["plan"]),
      "eventNames",
      JSON.stringify(["LOGIN"]),
    ]);
    await fakeClient.command([
      "HSET",
      "rt:workspace-1:user:user-1:traits",
      "plan",
      JSON.stringify("gold"),
    ]);
    await fakeClient.command([
      "ZADD",
      "rt:workspace-1:user:user-1:events:LOGIN",
      String(new Date("2026-01-01T00:00:00.000Z").getTime()),
      "message-1",
    ]);
    await fakeClient.command([
      "HSET",
      "rt:workspace-1:user:user-1:events:LOGIN:data",
      "message-1",
      JSON.stringify({
        event: "LOGIN",
        eventTime: "2026-01-01T00:00:00.000Z",
        messageId: "message-1",
        properties: { source: "cache" },
      }),
    ]);

    const state = await readRealtimeUserState({
      workspaceId: "workspace-1",
      userOrAnonymousId: "user-1",
      dependencies: {
        traitPaths: new Set(["plan"]),
        eventNames: new Set(["LOGIN"]),
        eventWindowSeconds: new Map([["LOGIN", 3600]]),
        always: false,
      },
    });

    expect(mockQuery).not.toHaveBeenCalled();
    expect(state.traits.plan).toBe("gold");
    expect(state.trackEvents).toEqual([
      expect.objectContaining({
        event: "LOGIN",
        messageId: "message-1",
        properties: { source: "cache" },
      }),
    ]);
  });

  it("fills cache after a cache miss and ClickHouse fallback", async () => {
    const fakeClient = new FakeStateCacheClient();
    enableStateCache(fakeClient);
    mockClickHouseRows([
      {
        trait_path: "plan",
        trait_value: JSON.stringify("gold"),
      },
    ]);
    mockClickHouseRows([
      {
        event: "LOGIN",
        message_id: "message-1",
        properties: JSON.stringify({ source: "clickhouse" }),
        event_time: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await readRealtimeUserState({
      workspaceId: "workspace-1",
      userOrAnonymousId: "user-1",
      dependencies: {
        traitPaths: new Set(["plan"]),
        eventNames: new Set(["LOGIN"]),
        eventWindowSeconds: new Map([["LOGIN", 3600]]),
        always: false,
      },
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(
      fakeClient.hashes
        .get("rt:workspace-1:user:user-1:meta")
        ?.get("eventNames"),
    ).toBe(JSON.stringify(["LOGIN"]));
    expect(
      fakeClient.zsets
        .get("rt:workspace-1:user:user-1:events:LOGIN")
        ?.has("message-1"),
    ).toBe(true);
  });

  it("writes identify traits through to the state cache", async () => {
    const fakeClient = new FakeStateCacheClient();
    enableStateCache(fakeClient);
    await fakeClient.command([
      "HSET",
      "rt:workspace-1:user:user-1:meta",
      "traitPaths",
      JSON.stringify(["plan"]),
      "eventNames",
      JSON.stringify([]),
    ]);
    await fakeClient.command([
      "HSET",
      "rt:workspace-1:user:user-1:traits",
      "plan",
      JSON.stringify("bronze"),
    ]);
    const job: RealtimeSegmentEvalJob = {
      workspaceId: "workspace-1",
      messageId: "message-2",
      userId: "user-1",
      userOrAnonymousId: "user-1",
      eventType: EventType.Identify,
      traitPaths: ["plan"],
      propertyPaths: [],
      payload: {
        traits: {
          plan: "gold",
        },
      },
      eventTime: new Date("2026-01-01T00:00:00.000Z"),
      processingTime: new Date("2026-01-01T00:00:00.000Z"),
    };

    const state = await readRealtimeUserState({
      workspaceId: "workspace-1",
      userOrAnonymousId: "user-1",
      dependencies: {
        traitPaths: new Set(["plan"]),
        eventNames: new Set(),
        eventWindowSeconds: new Map(),
        always: false,
      },
      currentJob: job,
    });

    expect(state.traits.plan).toBe("gold");
    expect(
      fakeClient.hashes.get("rt:workspace-1:user:user-1:traits")?.get("plan"),
    ).toBe(JSON.stringify("gold"));
  });

  it("writes track events through and prunes by max cached events", async () => {
    const fakeClient = new FakeStateCacheClient();
    enableStateCache(fakeClient);
    mockCacheConfig({ enabled: true, maxEventsPerUserEvent: 1 });
    await fakeClient.command([
      "HSET",
      "rt:workspace-1:user:user-1:meta",
      "traitPaths",
      JSON.stringify([]),
      "eventNames",
      JSON.stringify(["LOGIN"]),
    ]);
    await fakeClient.command([
      "ZADD",
      "rt:workspace-1:user:user-1:events:LOGIN",
      "1000",
      "old-message",
    ]);
    await fakeClient.command([
      "HSET",
      "rt:workspace-1:user:user-1:events:LOGIN:data",
      "old-message",
      JSON.stringify({
        event: "LOGIN",
        eventTime: "1970-01-01T00:00:01.000Z",
        messageId: "old-message",
        properties: {},
      }),
    ]);
    const job: RealtimeSegmentEvalJob = {
      workspaceId: "workspace-1",
      messageId: "new-message",
      userId: "user-1",
      userOrAnonymousId: "user-1",
      eventType: EventType.Track,
      event: "LOGIN",
      traitPaths: [],
      propertyPaths: [],
      payload: {
        properties: {
          source: "live",
        },
      },
      eventTime: new Date("2026-01-01T00:00:00.000Z"),
      processingTime: new Date("2026-01-01T00:00:00.000Z"),
    };

    const state = await readRealtimeUserState({
      workspaceId: "workspace-1",
      userOrAnonymousId: "user-1",
      dependencies: {
        traitPaths: new Set(),
        eventNames: new Set(["LOGIN"]),
        eventWindowSeconds: new Map([["LOGIN", null]]),
        always: false,
      },
      currentJob: job,
    });

    expect(state.trackEvents[0]).toEqual(
      expect.objectContaining({
        event: "LOGIN",
        messageId: "new-message",
      }),
    );
    expect(
      fakeClient.zsets
        .get("rt:workspace-1:user:user-1:events:LOGIN")
        ?.has("old-message"),
    ).toBe(false);
    expect(
      fakeClient.hashes
        .get("rt:workspace-1:user:user-1:events:LOGIN:data")
        ?.has("old-message"),
    ).toBe(false);
    expect(
      fakeClient.zsets
        .get("rt:workspace-1:user:user-1:events:LOGIN")
        ?.has("new-message"),
    ).toBe(true);
  });

  it("falls back to ClickHouse when the state cache fails", async () => {
    const fakeClient = new FakeStateCacheClient();
    fakeClient.failCommands = true;
    enableStateCache(fakeClient);
    mockClickHouseRows([
      {
        trait_path: "plan",
        trait_value: JSON.stringify("gold"),
      },
    ]);

    const state = await readRealtimeUserState({
      workspaceId: "workspace-1",
      userOrAnonymousId: "user-1",
      dependencies: {
        traitPaths: new Set(["plan"]),
        eventNames: new Set(),
        eventWindowSeconds: new Map(),
        always: false,
      },
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(state.traits.plan).toBe("gold");
  });
});
