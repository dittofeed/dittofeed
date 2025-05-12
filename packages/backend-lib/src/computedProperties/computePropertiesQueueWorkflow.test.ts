import { randomUUID } from "crypto";

import { compareWorkspaceItems } from "./computePropertiesQueueWorkflow";

describe("computePropertiesQueueWorkflow", () => {
  describe("compareWorkspaceItems", () => {
    describe("when you have two items, one with a maxPeriod and one without", () => {
      it("should return the item without a maxPeriod first", () => {
        const item1 = {
          id: randomUUID(),
          maxPeriod: 1000,
        };
        const item2 = {
          id: randomUUID(),
        };
        const items = [item1, item2];
        items.sort(compareWorkspaceItems);
        expect(items[0]).toBe(item2);
        expect(items[1]).toBe(item1);
      });
    });

    describe("when you have two items with different maxPeriods", () => {
      it("should return the item with the earlier maxPeriod first", () => {
        const item1 = {
          id: randomUUID(),
          maxPeriod: 2000, // Later
        };
        const item2 = {
          id: randomUUID(),
          maxPeriod: 1000, // Earlier
        };
        const items = [item1, item2];
        items.sort(compareWorkspaceItems);
        expect(items[0]).toBe(item2);
        expect(items[1]).toBe(item1);
      });
    });

    describe("when you have two items with same priority and maxPeriod (or undefined) but different insertedAt times", () => {
      it("should return the item with the earlier insertedAt first", () => {
        const item1 = {
          id: randomUUID(),
          insertedAt: 200, // Later
        };
        const item2 = {
          id: randomUUID(),
          insertedAt: 100, // Earlier
        };
        const items = [item1, item2];
        items.sort(compareWorkspaceItems);
        expect(items[0]).toBe(item2);
        expect(items[1]).toBe(item1);
      });

      it("should return the item with the earlier insertedAt first when maxPeriods are the same", () => {
        const item1 = {
          id: randomUUID(),
          maxPeriod: 1000,
          insertedAt: 200, // Later
        };
        const item2 = {
          id: randomUUID(),
          maxPeriod: 1000,
          insertedAt: 100, // Earlier
        };
        const items = [item1, item2];
        items.sort(compareWorkspaceItems);
        expect(items[0]).toBe(item2);
        expect(items[1]).toBe(item1);
      });

      it("should return the item with the earlier insertedAt first when priorities are the same", () => {
        const item1 = {
          id: randomUUID(),
          priority: 1,
          insertedAt: 200, // Later
        };
        const item2 = {
          id: randomUUID(),
          priority: 1,
          insertedAt: 100, // Earlier
        };
        const items = [item1, item2];
        items.sort(compareWorkspaceItems);
        expect(items[0]).toBe(item2);
        expect(items[1]).toBe(item1);
      });
    });
  });
});
