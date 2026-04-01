import { ClickHouseQueryBuilder } from "./clickhouse";
import {
  expandKnownUserIdsPredicateSql,
  extractAliasLinkRows,
  identifyMessageCreatesIdentityLink,
} from "./identityLinks";
import { EventType } from "./types";

describe("identityLinks", () => {
  describe("expandKnownUserIdsPredicateSql", () => {
    it("matches direct ids and linked anonymous_ids (FINAL latest table)", () => {
      const qb = new ClickHouseQueryBuilder({ debug: true });
      const workspaceClause = "workspace_id = 'ws-1'";
      const idsParam = qb.addQueryValue(["known-1", "known-2"], "Array(String)");
      const sql = expandKnownUserIdsPredicateSql(workspaceClause, idsParam);
      expect(sql).toContain("user_or_anonymous_id IN ");
      expect(sql).toContain("identity_links_latest_v1");
      expect(sql).toContain("FINAL");
      expect(sql).toContain("user_id IN ");
    });

    it("includes OR branch for anonymous_id subquery (empty subquery ⇒ first IN alone matches)", () => {
      const qb = new ClickHouseQueryBuilder({ debug: true });
      const sql = expandKnownUserIdsPredicateSql(
        "workspace_id = 'ws-1'",
        qb.addQueryValue(["known-1"], "Array(String)"),
      );
      expect(sql).toMatch(/user_or_anonymous_id IN[\s\S]+OR\s+user_or_anonymous_id IN/);
    });

    it("allows workspace_id IN (...) for parent/child workspace scoping", () => {
      const qb = new ClickHouseQueryBuilder({ debug: true });
      const sql = expandKnownUserIdsPredicateSql(
        "workspace_id IN ('parent-ws','child-ws')",
        qb.addQueryValue(["u1"], "Array(String)"),
      );
      expect(sql).toContain(
        "WHERE workspace_id IN ('parent-ws','child-ws') AND user_id IN ",
      );
    });
  });

  describe("extractAliasLinkRows", () => {
    it("returns rows for alias batch items", () => {
      const ws = "ws-1";
      const rows = extractAliasLinkRows(ws, [
        {
          type: EventType.Alias,
          userId: "known",
          previousId: "anon",
          messageId: "m1",
          timestamp: "2024-01-01T00:00:00.000Z",
        },
      ]);
      expect(rows).toEqual([
        {
          workspace_id: ws,
          anonymous_id: "anon",
          user_id: "known",
          linked_at: "2024-01-01T00:00:00.000Z",
          message_id: "m1",
        },
      ]);
    });

    it("ignores non-alias messages", () => {
      expect(
        extractAliasLinkRows("ws", [
          {
            type: EventType.Track,
            event: "e",
            messageId: "m",
            userId: "u",
          },
        ]),
      ).toEqual([]);
    });
  });

  describe("identifyMessageCreatesIdentityLink", () => {
    it("is true for known identify with root anonymousId", () => {
      expect(
        identifyMessageCreatesIdentityLink({
          type: EventType.Identify,
          userId: "u1",
          anonymousId: "a1",
          messageId: "m1",
        }),
      ).toBe(true);
    });

    it("is true for known identify with traits.anonymousId", () => {
      expect(
        identifyMessageCreatesIdentityLink({
          type: EventType.Identify,
          userId: "u1",
          messageId: "m1",
          traits: { anonymousId: "a1" },
        }),
      ).toBe(true);
    });

    it("is false without userId", () => {
      expect(
        identifyMessageCreatesIdentityLink({
          type: EventType.Identify,
          anonymousId: "a1",
          messageId: "m1",
        }),
      ).toBe(false);
    });

    it("is false for track", () => {
      expect(
        identifyMessageCreatesIdentityLink({
          type: EventType.Track,
          event: "e",
          userId: "u1",
          messageId: "m1",
        }),
      ).toBe(false);
    });
  });
});
