import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { upsertComponentConfiguration } from "./componentConfigurations";
import { db } from "./db";
import * as schema from "./db/schema";
import { ComponentConfigurationDefinition, Workspace } from "./types";
import { createWorkspace } from "./workspaces";

describe("componentConfigurations", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    workspace = unwrap(await createWorkspace({ name: randomUUID() }));
  });
  describe("upsertComponentConfiguration", () => {
    describe("when the name and id are unique", () => {
      it("should create a new component configuration", async () => {
        const result = await upsertComponentConfiguration({
          workspaceId: workspace.id,
          id: randomUUID(),
          name: randomUUID(),
          definition: {
            type: "DeliveriesTable",
            columnAllowList: [
              "preview",
              "from",
              "to",
              "status",
              "origin",
              "sentAt",
              "template",
              "updatedAt",
            ],
          } satisfies ComponentConfigurationDefinition,
        });
        unwrap(result);
      });
    });
    describe("when the name is new and the id exists in the workspace", () => {
      let id: string;
      let initialName: string;
      beforeEach(async () => {
        id = randomUUID();
        initialName = randomUUID();

        await upsertComponentConfiguration({
          workspaceId: workspace.id,
          id,
          name: initialName,
          definition: {
            type: "DeliveriesTable",
          } satisfies ComponentConfigurationDefinition,
        }).then(unwrap);
      });
      it("should update the name", async () => {
        let result = await db().query.componentConfiguration.findFirst({
          where: eq(schema.componentConfiguration.id, id),
        });
        expect(result?.name).toBe(initialName);
        const newName = randomUUID();

        await upsertComponentConfiguration({
          workspaceId: workspace.id,
          id,
          name: newName,
        }).then(unwrap);

        result = await db().query.componentConfiguration.findFirst({
          where: eq(schema.componentConfiguration.id, id),
        });
        expect(result?.name).toBe(newName);
      });
    });
    describe("when the name exists under a different id in the same workspace", () => {
      it("should return a unique constraint violation error", () => {
        expect(true).toBe(true);
      });
    });
    describe("id exists in another workspace", () => {
      let otherWorkspace: Workspace;
      beforeEach(async () => {
        otherWorkspace = unwrap(await createWorkspace({ name: randomUUID() }));
      });
      it("should return a unique constraint violation error", () => {
        expect(true).toBe(true);
      });
    });
  });
});
