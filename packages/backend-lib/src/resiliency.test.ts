import { WorkspaceStatus } from "@prisma/client";
import { randomUUID } from "crypto";

import prisma from "./prisma";
import {
  findActiveWorkspaces,
  observeWorkspaceComputeLatency,
} from "./resiliency";
import {
  ComputedPropertyStep,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
} from "./types";

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

async function createWorkspace(status: WorkspaceStatus): Promise<{
  workspaceId: string;
}> {
  const workspace = await prisma().workspace.create({
    data: {
      id: randomUUID(),
      name: randomUUID(),
      status,
    },
  });
  await prisma().segment.create({
    data: {
      id: randomUUID(),
      workspaceId: workspace.id,
      name: randomUUID(),
      definition: {
        entryNode: {
          id: randomUUID(),
          type: SegmentNodeType.Trait,
          path: "trait",
          operator: {
            type: SegmentOperatorType.Within,
            windowSeconds: 1000,
          },
        },
        nodes: [],
      } satisfies SegmentDefinition,
    },
  });
  await prisma().computedPropertyPeriod.create({
    data: {
      id: randomUUID(),
      step: ComputedPropertyStep.ProcessAssignments,
      from: new Date(Date.now() - 1000 * 60),
      to: new Date(),
      type: "Segment",
      version: Date.now().toString(),
      computedPropertyId: randomUUID(),
      workspaceId: workspace.id,
    },
  });
  return { workspaceId: workspace.id };
}

describe("findActiveWorkspaces", () => {
  let activeWorkspace: string;
  let tombstonedWorkspace: string;

  beforeEach(async () => {
    const [active, tombstoned] = await Promise.all([
      createWorkspace(WorkspaceStatus.Active),
      createWorkspace(WorkspaceStatus.Tombstoned),
    ]);
    activeWorkspace = active.workspaceId;
    tombstonedWorkspace = tombstoned.workspaceId;
  });
  test("returns active workspaces and their latest compute period", async () => {
    const { workspaces } = await findActiveWorkspaces();
    expect(
      workspaces.find((w) => w.id === activeWorkspace),
    ).not.toBeUndefined();
    expect(
      workspaces.find((w) => w.id === tombstonedWorkspace),
    ).toBeUndefined();
  });
});
