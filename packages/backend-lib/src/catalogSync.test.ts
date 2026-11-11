import { randomUUID } from "crypto";
import { createServer, Server } from "http";
import {
  CatalogItemStatus,
  CatalogSourceType,
  CatalogSyncStatus,
} from "isomorphic-lib/src/catalog";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import {
  listCatalogItems,
  upsertCatalog,
  upsertCatalogItems,
} from "./catalogs";
import {
  claimCatalog,
  findDueCatalogs,
  MAX_RETRY_MINUTES,
  retryDelayMinutes,
  syncCatalog,
} from "./catalogSync";
import { insert } from "./db";
import { workspace as dbWorkspace } from "./db/schema";
import { Workspace } from "./types";

/**
 * Feed syncing is the part that decides whether a catalog is actually fresh, so
 * these tests cover the two things that have bitten every implementation of it:
 * a failed pull emptying the catalog, and two workers pulling the same feed.
 */

function startFeedServer(): Promise<{
  server: Server;
  url: string;
  setBody: (body: string, status?: number) => void;
}> {
  let body = "";
  let status = 200;
  const server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Feed server did not bind a port");
      }
      const { port } = address;
      resolve({
        server,
        url: `http://127.0.0.1:${port}/feed.json`,
        setBody: (next: string, nextStatus = 200) => {
          body = next;
          status = nextStatus;
        },
      });
    });
  });
}

describe("catalogSync", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = unwrap(
      await insert({
        table: dbWorkspace,
        values: {
          id: randomUUID(),
          name: `workspace-${randomUUID()}`,
          updatedAt: new Date(),
        },
      }),
    );
  });

  describe("retryDelayMinutes", () => {
    it("doubles the interval per failure", () => {
      expect(
        retryDelayMinutes({ syncIntervalMinutes: 60, consecutiveFailures: 0 }),
      ).toEqual(60);
      expect(
        retryDelayMinutes({ syncIntervalMinutes: 60, consecutiveFailures: 1 }),
      ).toEqual(120);
      expect(
        retryDelayMinutes({ syncIntervalMinutes: 60, consecutiveFailures: 3 }),
      ).toEqual(480);
    });

    it("caps the delay", () => {
      expect(
        retryDelayMinutes({ syncIntervalMinutes: 360, consecutiveFailures: 9 }),
      ).toEqual(MAX_RETRY_MINUTES);
    });
  });

  describe("upsertCatalog with a feed", () => {
    it("marks a catalog with a sourceUrl as feed sourced and due now", async () => {
      const catalog = unwrap(
        await upsertCatalog({
          workspaceId: workspace.id,
          name: "feed-catalog",
          sourceUrl: "https://example.test/feed.json",
        }),
      );
      expect(catalog.sourceType).toEqual(CatalogSourceType.Feed);
      expect(catalog.sourceUrl).toEqual("https://example.test/feed.json");
      expect(catalog.syncEnabled).toEqual(true);
      expect(catalog.syncIntervalMinutes).toEqual(360);
      expect(catalog.consecutiveFailures).toEqual(0);
      expect(catalog.nextSyncAt).toBeDefined();
    });

    it("leaves an api catalog unscheduled", async () => {
      const catalog = unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "api-catalog" }),
      );
      expect(catalog.sourceType).toEqual(CatalogSourceType.Api);
      expect(catalog.nextSyncAt).toBeUndefined();
      expect(catalog.sourceUrl).toBeUndefined();
    });
  });

  describe("findDueCatalogs", () => {
    it("returns feed catalogs that are due and skips paused or api ones", async () => {
      const due = unwrap(
        await upsertCatalog({
          workspaceId: workspace.id,
          name: "due",
          sourceUrl: "https://example.test/due.json",
        }),
      );
      await upsertCatalog({ workspaceId: workspace.id, name: "paused" });
      const paused = unwrap(
        await upsertCatalog({
          workspaceId: workspace.id,
          name: "paused-feed",
          sourceUrl: "https://example.test/paused.json",
          syncEnabled: false,
        }),
      );

      const results = await findDueCatalogs({ limit: 100 });
      const ids = results.map((entry) => entry.id);
      expect(ids).toContain(due.id);
      expect(ids).not.toContain(paused.id);
      // An api catalog has no sourceUrl, so the scheduler never touches it.
      expect(results.every((entry) => entry.sourceUrl.length > 0)).toEqual(
        true,
      );
    });

    it("skips a catalog scheduled in the future", async () => {
      const catalog = unwrap(
        await upsertCatalog({
          workspaceId: workspace.id,
          name: "later",
          sourceUrl: "https://example.test/later.json",
        }),
      );
      const claimed = await claimCatalog({
        catalogId: catalog.id,
        now: new Date(),
      });
      expect(claimed).not.toBeNull();
      const again = await findDueCatalogs({ limit: 100 });
      expect(again.map((entry) => entry.id)).not.toContain(catalog.id);
    });
  });

  describe("claimCatalog", () => {
    it("lets exactly one caller win the same catalog", async () => {
      const catalog = unwrap(
        await upsertCatalog({
          workspaceId: workspace.id,
          name: "claimed",
          sourceUrl: "https://example.test/claimed.json",
          syncIntervalMinutes: 30,
        }),
      );
      const now = new Date();
      const first = await claimCatalog({ catalogId: catalog.id, now });
      const second = await claimCatalog({ catalogId: catalog.id, now });
      expect(first?.id).toEqual(catalog.id);
      expect(second).toBeNull();

      const refreshed = unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "claimed" }),
      );
      expect(refreshed.nextSyncAt).toBeGreaterThan(
        now.getTime() + 29 * 60 * 1000,
      );
    });
  });

  describe("syncCatalog", () => {
    let feed: Awaited<ReturnType<typeof startFeedServer>>;

    beforeEach(async () => {
      feed = await startFeedServer();
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        feed.server.close(() => resolve());
      });
    });

    it("pulls items from a JSON feed", async () => {
      feed.setBody(
        JSON.stringify([
          {
            itemId: "p-1",
            title: "Court Pump",
            price: 49.95,
            inventoryQuantity: 4,
          },
          { itemId: "p-2", title: "Ankle Boot", price: 149.95 },
        ]),
      );
      unwrap(
        await upsertCatalog({
          workspaceId: workspace.id,
          name: "shop",
          sourceUrl: feed.url,
        }),
      );

      const result = unwrap(
        await syncCatalog({ workspaceId: workspace.id, catalogName: "shop" }),
      );
      expect(result.status).toEqual("ok");
      expect(result.upsertedCount).toEqual(2);

      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "shop",
        }),
      );
      expect(items.items.map((item) => item.itemId).sort()).toEqual([
        "p-1",
        "p-2",
      ]);
      expect(items.items[0]?.title).toBeDefined();

      const catalog = unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "shop" }),
      );
      expect(catalog.syncStatus).toEqual(CatalogSyncStatus.Ok);
      expect(catalog.lastSyncedAt).toBeDefined();
      expect(catalog.consecutiveFailures).toEqual(0);
      expect(catalog.feedFormat).toEqual("json");
    });

    it("archives items the feed no longer carries", async () => {
      feed.setBody(
        JSON.stringify([
          { itemId: "p-1", title: "Court Pump" },
          { itemId: "p-2", title: "Ankle Boot" },
        ]),
      );
      unwrap(
        await upsertCatalog({
          workspaceId: workspace.id,
          name: "shrinking",
          sourceUrl: feed.url,
        }),
      );
      unwrap(
        await syncCatalog({
          workspaceId: workspace.id,
          catalogName: "shrinking",
        }),
      );

      feed.setBody(JSON.stringify([{ itemId: "p-1", title: "Court Pump" }]));
      const second = unwrap(
        await syncCatalog({
          workspaceId: workspace.id,
          catalogName: "shrinking",
        }),
      );
      expect(second.archivedCount).toEqual(1);

      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "shrinking",
        }),
      );
      expect(items.items.map((item) => item.itemId)).toEqual(["p-1"]);
      const archived = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "shrinking",
          status: CatalogItemStatus.Archived,
        }),
      );
      expect(archived.items.map((item) => item.itemId)).toEqual(["p-2"]);
    });

    it("keeps the catalog intact when the feed fails", async () => {
      feed.setBody(JSON.stringify([{ itemId: "p-1", title: "Court Pump" }]));
      unwrap(
        await upsertCatalog({
          workspaceId: workspace.id,
          name: "flaky",
          sourceUrl: feed.url,
          syncIntervalMinutes: 60,
        }),
      );
      unwrap(
        await syncCatalog({ workspaceId: workspace.id, catalogName: "flaky" }),
      );

      feed.setBody("boom", 500);
      const failed = await syncCatalog({
        workspaceId: workspace.id,
        catalogName: "flaky",
      });
      expect(failed.isErr()).toEqual(true);

      // The previously synced item must still render.
      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "flaky",
        }),
      );
      expect(items.items.map((item) => item.itemId)).toEqual(["p-1"]);

      const catalog = unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "flaky" }),
      );
      expect(catalog.syncStatus).toEqual(CatalogSyncStatus.Failed);
      expect(catalog.consecutiveFailures).toEqual(1);
      expect(catalog.nextSyncAt).toBeGreaterThan(Date.now());
    });

    it("refuses to archive a catalog when the feed yields no items", async () => {
      feed.setBody(JSON.stringify([{ itemId: "p-1", title: "Court Pump" }]));
      unwrap(
        await upsertCatalog({
          workspaceId: workspace.id,
          name: "empty-feed",
          sourceUrl: feed.url,
        }),
      );
      unwrap(
        await syncCatalog({
          workspaceId: workspace.id,
          catalogName: "empty-feed",
        }),
      );

      feed.setBody(JSON.stringify([]));
      const result = await syncCatalog({
        workspaceId: workspace.id,
        catalogName: "empty-feed",
      });
      expect(result.isErr()).toEqual(true);
      const items = unwrap(
        await listCatalogItems({
          workspaceId: workspace.id,
          catalogName: "empty-feed",
        }),
      );
      expect(items.items.map((item) => item.itemId)).toEqual(["p-1"]);
    });

    it("rejects a catalog that has no sourceUrl", async () => {
      unwrap(
        await upsertCatalog({ workspaceId: workspace.id, name: "manual" }),
      );
      await upsertCatalogItems({
        workspaceId: workspace.id,
        catalogName: "manual",
        items: [{ itemId: "p-1", title: "Court Pump" }],
      });
      const result = await syncCatalog({
        workspaceId: workspace.id,
        catalogName: "manual",
      });
      expect(result.isErr()).toEqual(true);
      if (result.isErr()) {
        expect(result.error.code).toEqual("invalid");
      }
    });

    it("reports an unknown catalog as not found", async () => {
      const result = await syncCatalog({
        workspaceId: workspace.id,
        catalogName: "does-not-exist",
      });
      expect(result.isErr()).toEqual(true);
      if (result.isErr()) {
        expect(result.error.code).toEqual("notFound");
      }
    });
  });
});
