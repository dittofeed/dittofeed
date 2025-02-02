import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "../db";
import * as schema from "../db/schema";
import { upsertWorkspace } from "./createWorkspace";

describe("createWorkspaces", () => {
  describe("upsertWorkspace", () => {
    describe("when a workspace already exists", () => {
      let workspaceName: string;
      beforeEach(async () => {
        workspaceName = randomUUID();
        await upsertWorkspace({
          name: workspaceName,
        });
      });
      it("should create a workspace", async () => {
        const workspace = await upsertWorkspace({
          name: workspaceName,
        });
        expect(workspace).toBeDefined();
        const workspacesFromDb = await db().query.workspace.findMany({
          where: eq(schema.workspace.name, workspaceName),
        });
        expect(workspacesFromDb).toHaveLength(1);
        expect(workspacesFromDb[0]?.name).toBe(workspaceName);
      });
    });
  });
});
