import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db, insert } from "./db";
import * as schema from "./db/schema";
import { duplicateResource } from "./resources";
import {
  DuplicateResourceErrorType,
  SegmentDefinition,
  SegmentNodeType,
  UserPropertyDefinitionType,
} from "./types";
import { createWorkspace } from "./workspaces";

describe("duplicateResource", () => {
  it("duplicates a segment with generated name suffix", async () => {
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `workspace-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const definition: SegmentDefinition = {
      entryNode: {
        type: SegmentNodeType.Everyone,
        id: "entry",
      },
      nodes: [],
    };

    const original = unwrap(
      await insert({
        table: schema.segment,
        values: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: "Segment Original",
          definition,
          updatedAt: new Date(),
        },
      }),
    );

    const result = await duplicateResource({
      workspaceId: workspace.id,
      name: original.name,
      resourceType: "Segment",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error("Expected result to be Ok");
    }

    const duplicate = result.value;
    expect(duplicate.name).toBe("Segment Original (1)");
    expect(duplicate.id).not.toBe(original.id);

    const stored = await db().query.segment.findFirst({
      where: and(
        eq(schema.segment.id, duplicate.id),
        eq(schema.segment.workspaceId, workspace.id),
      ),
    });
    expect(stored?.definition).toEqual(definition);
  });

  it("prevents duplicating protected user properties", async () => {
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `workspace-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const result = await duplicateResource({
      workspaceId: workspace.id,
      name: "id", // "id" is a protected user property
      resourceType: "UserProperty",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected result to be Err");
    }

    expect(result.error.type).toBe(
      DuplicateResourceErrorType.ProtectedResource,
    );
    expect(result.error.message).toContain("protected user property");
  });

  it("duplicates a user property with generated name suffix", async () => {
    const workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `workspace-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const original = unwrap(
      await insert({
        table: schema.userProperty,
        values: {
          id: randomUUID(),
          workspaceId: workspace.id,
          name: "Custom Property",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "customPath",
          },
        },
      }),
    );

    const result = await duplicateResource({
      workspaceId: workspace.id,
      name: original.name,
      resourceType: "UserProperty",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error("Expected result to be Ok");
    }

    const duplicate = result.value;
    expect(duplicate.name).toBe("Custom Property (1)");
    expect(duplicate.id).not.toBe(original.id);

    const stored = await db().query.userProperty.findFirst({
      where: and(
        eq(schema.userProperty.id, duplicate.id),
        eq(schema.userProperty.workspaceId, workspace.id),
      ),
    });
    expect(stored?.name).toBe("Custom Property (1)");
  });
});
