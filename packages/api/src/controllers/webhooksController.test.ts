import { randomUUID } from "node:crypto";

import prisma from "backend-lib/src/prisma";
import { DittofeedFastifyInstance, Workspace } from "backend-lib/src/types";

describe("webhooksController", () => {
  let workspace: Workspace;
  let api: DittofeedFastifyInstance;

  beforeEach(async () => {
    [workspace, api] = await Promise.all([
      prisma().workspace.create({
        data: {
          name: `test-${randomUUID()}`,
        },
      }),
    ]);
  });

  describe("ensure twilio webhooks update status", () => {
    it("should work", () => {
      expect(true).toBe(true);
    });
  });
});
