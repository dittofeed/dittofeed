import config from "../config";
import { DragonflyClient, DragonflyValue } from "../dragonfly";
import {
  fillSegmentAssignmentsCache,
  fillUserPropertyAssignmentsCache,
  readCachedSegmentAssignments,
  readCachedUserPropertyAssignments,
  setComputedPropertyAssignmentCacheClientForTest,
  writeThroughSegmentAssignmentsCache,
  writeThroughUserPropertyAssignmentsCache,
} from "./assignmentCache";

jest.mock("../config", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    computedPropertyAssignmentsCacheEnabled: false,
    computedPropertyAssignmentsCacheTtlSeconds: 300,
    realtimeSegmentsStateCacheUrl: "redis://localhost:6379",
  })),
}));

const mockConfig = jest.mocked(config);

class FakeAssignmentCacheClient implements DragonflyClient {
  hashes = new Map<string, Map<string, string>>();

  failCommands = false;

  close(): void {
    this.hashes.clear();
  }

  command(args: string[]): Promise<DragonflyValue> {
    if (this.failCommands) {
      return Promise.reject(new Error("cache unavailable"));
    }
    const [command, key, ...rest] = args;
    switch (command) {
      case "HGETALL": {
        const hash = this.hashes.get(key ?? "");
        return Promise.resolve(hash ? [...hash.entries()].flat() : []);
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
        return Promise.resolve(rest.length / 2);
      }
      case "HMGET": {
        const hash = this.hashes.get(key ?? "") ?? new Map<string, string>();
        return Promise.resolve(rest.map((field) => hash.get(field) ?? null));
      }
      case "EXPIRE":
        return Promise.resolve(1);
      default:
        return Promise.reject(
          new Error(`Unsupported fake command ${command ?? ""}`),
        );
    }
  }
}

function enableAssignmentCache(fakeClient: FakeAssignmentCacheClient): void {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  mockConfig.mockReturnValue({
    computedPropertyAssignmentsCacheEnabled: true,
    computedPropertyAssignmentsCacheTtlSeconds: 300,
    realtimeSegmentsStateCacheUrl: "redis://localhost:6379",
  } as ReturnType<typeof config>);
  setComputedPropertyAssignmentCacheClientForTest(fakeClient);
}

describe("computed property assignment cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    mockConfig.mockReturnValue({
      computedPropertyAssignmentsCacheEnabled: false,
      computedPropertyAssignmentsCacheTtlSeconds: 300,
      realtimeSegmentsStateCacheUrl: "redis://localhost:6379",
    } as ReturnType<typeof config>);
    setComputedPropertyAssignmentCacheClientForTest(null);
  });

  it("returns cached user property assignments when requested ids are covered", async () => {
    const fakeClient = new FakeAssignmentCacheClient();
    enableAssignmentCache(fakeClient);
    await fillUserPropertyAssignmentsCache({
      workspaceId: "workspace-1",
      userId: "user-1",
      userPropertyIds: ["plan", "empty"],
      assignments: new Map([["plan", JSON.stringify("gold")]]),
    });

    const assignments = await readCachedUserPropertyAssignments({
      workspaceId: "workspace-1",
      userId: "user-1",
      userPropertyIds: ["plan", "empty"],
    });

    expect(assignments?.get("plan")).toBe(JSON.stringify("gold"));
    expect(assignments?.has("empty")).toBe(false);
  });

  it("misses when user property ids are not fully covered", async () => {
    const fakeClient = new FakeAssignmentCacheClient();
    enableAssignmentCache(fakeClient);
    await fillUserPropertyAssignmentsCache({
      workspaceId: "workspace-1",
      userId: "user-1",
      userPropertyIds: ["plan"],
      assignments: new Map([["plan", JSON.stringify("gold")]]),
    });

    const assignments = await readCachedUserPropertyAssignments({
      workspaceId: "workspace-1",
      userId: "user-1",
      userPropertyIds: ["plan", "tier"],
    });

    expect(assignments).toBeNull();
  });

  it("stores segment true false and null assignments", async () => {
    const fakeClient = new FakeAssignmentCacheClient();
    enableAssignmentCache(fakeClient);
    await fillSegmentAssignmentsCache({
      workspaceId: "workspace-1",
      userId: "user-1",
      segmentIds: ["segment-1", "segment-2", "segment-3"],
      assignments: new Map<string, boolean | null>([
        ["segment-1", true],
        ["segment-2", false],
        ["segment-3", null],
      ]),
    });

    const assignments = await readCachedSegmentAssignments({
      workspaceId: "workspace-1",
      userId: "user-1",
      segmentIds: ["segment-1", "segment-2", "segment-3"],
    });

    expect(assignments?.get("segment-1")).toBe(true);
    expect(assignments?.get("segment-2")).toBe(false);
    expect(assignments?.get("segment-3")).toBeNull();
  });

  it("writes through realtime segment assignment changes", async () => {
    const fakeClient = new FakeAssignmentCacheClient();
    enableAssignmentCache(fakeClient);

    await writeThroughSegmentAssignmentsCache([
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        segmentId: "segment-1",
        inSegment: true,
      },
    ]);

    const assignments = await readCachedSegmentAssignments({
      workspaceId: "workspace-1",
      userId: "user-1",
      segmentIds: ["segment-1"],
    });
    expect(assignments?.get("segment-1")).toBe(true);
  });

  it("writes through realtime user property assignment changes", async () => {
    const fakeClient = new FakeAssignmentCacheClient();
    enableAssignmentCache(fakeClient);

    await writeThroughUserPropertyAssignmentsCache([
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        userPropertyId: "plan",
        value: JSON.stringify("gold"),
      },
    ]);

    const assignments = await readCachedUserPropertyAssignments({
      workspaceId: "workspace-1",
      userId: "user-1",
      userPropertyIds: ["plan"],
    });
    expect(assignments?.get("plan")).toBe(JSON.stringify("gold"));
  });

  it("falls back on cache command errors", async () => {
    const fakeClient = new FakeAssignmentCacheClient();
    fakeClient.failCommands = true;
    enableAssignmentCache(fakeClient);

    await expect(
      readCachedSegmentAssignments({
        workspaceId: "workspace-1",
        userId: "user-1",
        segmentIds: ["segment-1"],
      }),
    ).resolves.toBeNull();
  });
});
