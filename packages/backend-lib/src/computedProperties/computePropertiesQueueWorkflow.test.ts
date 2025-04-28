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
  });
});
