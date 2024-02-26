import { command } from "backend-lib/src/clickhouse";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import {
  startComputePropertiesWorkflow,
  terminateComputePropertiesWorkflow,
} from "backend-lib/src/segments/computePropertiesWorkflow/lifecycle";
import { Workspace } from "backend-lib/src/types";
import { createUserEventsTables } from "backend-lib/src/userEvents/clickhouse";

import { spawnWithEnv } from "./spawn";

async function upgradeWorkspaceV010Pre(workspace: Workspace) {
  logger().info(
    {
      workspaceName: workspace.name,
    },
    "Performing pre-upgrade steps for workspace"
  );
  await terminateComputePropertiesWorkflow({ workspaceId: workspace.id });
}

export async function upgradeV010Pre() {
  logger().info("Performing pre-upgrade steps for v0.10.0");

  // run sql migrations
  await spawnWithEnv([
    "yarn",
    "workspace",
    "backend-lib",
    "prisma",
    "migrate",
    "deploy",
  ]);

  // create new clickhouse tables and views
  await createUserEventsTables();

  const workspaces = await prisma().workspace.findMany();
  await Promise.all(workspaces.map(upgradeWorkspaceV010Pre));
  logger().info("Pre-upgrade steps for v0.10.0 completed.");
}

async function upgradeWorkspaceV010Post(workspace: Workspace) {
  logger().info(
    {
      workspaceName: workspace.name,
    },
    "Performing post-upgrade steps for workspace"
  );
  await startComputePropertiesWorkflow({ workspaceId: workspace.id });
}

export async function upgradeV010Post() {
  logger().info("Performing post-upgrade steps for v0.10.0");
  await prisma().computedPropertyPeriod.deleteMany({});
  const workspaces = await prisma().workspace.findMany();
  await Promise.all(workspaces.map(upgradeWorkspaceV010Post));
  const chQueries: string[] = [];
  for (const query of chQueries) {
    // eslint-disable-next-line no-await-in-loop
    await command({ query, clickhouse_settings: { wait_end_of_query: 1 } });
  }
  logger().info("Performing post-upgrade steps for v0.10.0 completed.");
}
