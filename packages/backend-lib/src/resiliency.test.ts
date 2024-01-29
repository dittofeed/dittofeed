import { randomUUID } from "crypto";

import prisma from "./prisma";
import { observeWorkspaceComputeLatency } from "./resiliency";

describe("observeWorkspaceComputeLatency", () => {
  beforeEach(async () => {
    await prisma().workspace.create({
      data: {
        name: randomUUID(),
      },
    });
  });
  test("does not throw", async () => {
    await observeWorkspaceComputeLatency();
  });
});
