import { EventType } from "../types";
import { buildRealtimeSegmentEvalJobs } from "./enqueue";

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
        anonymousId: "anon-1",
        userOrAnonymousId: "anon-1",
        eventType: EventType.Track,
        event: "Purchase",
        traitPaths: [],
        propertyPaths: ["amount", "currency"],
      }),
    );
  });

  it("skips events without a user or anonymous identifier", () => {
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
