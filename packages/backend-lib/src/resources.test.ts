import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db, insert } from "./db";
import * as schema from "./db/schema";
import { duplicateResource } from "./resources";
import { SegmentDefinition, SegmentNodeType } from "./types";
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

    const duplicate = await duplicateResource({
      workspaceId: workspace.id,
      name: original.name,
      resourceType: "Segment",
    });

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
});
