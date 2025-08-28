import { WorkflowClient } from "@temporalio/client";
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
} from "@temporalio/common";
import { inArray, SQL } from "drizzle-orm";
import {
  FeatureNamesEnum,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "isomorphic-lib/src/types";

import config from "../../config";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { GLOBAL_CRON_ID, globalCronWorkflow } from "../../globalCronWorkflow";
import logger from "../../logger";
import connectWorkflowClient from "../../temporal/connectWorkflowClient";
import {
  addWorkspacesSignalV2,
  COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
  computePropertiesQueueWorkflow,
  ComputePropertiesQueueWorkflowParams,
  WorkspaceQueueSignal,
} from "../computePropertiesQueueWorkflow";
import {
  computePropertiesEarlySignal,
  computePropertiesWorkflow,
  generateComputePropertiesId,
} from "../computePropertiesWorkflow";
import {
  COMPUTE_PROPERTIES_SCHEDULER_WORKFLOW_ID,
  computePropertiesSchedulerWorkflow,
} from "../comutePropertiesSchedulerWorkflow";

export async function startComputePropertiesWorkflow({
  workspaceId,
  client,
}: {
  workspaceId: string;
  client?: WorkflowClient;
}) {
  const temporalClient = client ?? (await connectWorkflowClient());
  const {
    computePropertiesWorkflowTaskTimeout,
    defaultUserEventsTableVersion,
  } = config();

  try {
    await temporalClient.start(computePropertiesWorkflow, {
      taskQueue: config().computedPropertiesTaskQueue,
      workflowId: generateComputePropertiesId(workspaceId),
      workflowTaskTimeout: computePropertiesWorkflowTaskTimeout,
      args: [
        {
          tableVersion: defaultUserEventsTableVersion,
          workspaceId,
          shouldContinueAsNew: true,
        },
      ],
    });
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info(
        {
          workspaceId,
        },
        "Compute properties workflow already started.",
      );
    }
  }
}

export async function startGlobalCron({
  client,
}: {
  client?: WorkflowClient;
} = {}) {
  const temporalClient = client ?? (await connectWorkflowClient());
  try {
    await temporalClient.start(globalCronWorkflow, {
      taskQueue: config().globalCronTaskQueue,
      cronSchedule: "*/5 * * * *",
      workflowId: GLOBAL_CRON_ID,
    });
  } catch (e) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      logger().info("Global cron already started.");
    } else {
      logger().error(
        {
          err: e,
        },
        "Failed to start global cron.",
      );
    }
  }
}

export async function resetGlobalCron() {
  const client = await connectWorkflowClient();
  try {
    await client.getHandle(GLOBAL_CRON_ID).terminate();
  } catch (e) {
    logger().info(
      {
        err: e,
      },
      "Failed to terminate global cron.",
    );
  }
  try {
    await startGlobalCron({ client });
  } catch (e) {
    logger().error(
      {
        err: e,
      },
      "Failed to start global cron.",
    );
  }
}

export async function terminateComputePropertiesWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const client = await connectWorkflowClient();
  try {
    await client
      .getHandle(generateComputePropertiesId(workspaceId))
      .terminate();
  } catch (e) {
    logger().info(
      {
        err: e,
      },
      "Failed to terminate compute properties workflow.",
    );
  }
}

export async function stopComputePropertiesWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const client = await connectWorkflowClient();
  try {
    await client
      .getHandle(generateComputePropertiesId(workspaceId))
      .terminate();
  } catch (e) {
    logger().info(
      {
        err: e,
        workspaceId,
      },
      "Failed to stop compute properties workflow.",
    );
  }
}

export async function resetComputePropertiesWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const client = await connectWorkflowClient();
  try {
    await client
      .getHandle(generateComputePropertiesId(workspaceId))
      .terminate();
  } catch (e) {
    logger().info(
      {
        err: e,
      },
      "Failed to terminate compute properties workflow.",
    );
  }

  try {
    await startComputePropertiesWorkflow({
      workspaceId,
      client,
    });
  } catch (e) {
    logger().error(
      {
        err: e,
      },
      "Failed to start compute properties workflow.",
    );
  }
}

export async function stopComputePropertiesWorkflowGlobal() {
  const client = await connectWorkflowClient();
  try {
    await client
      .getHandle(COMPUTE_PROPERTIES_SCHEDULER_WORKFLOW_ID)
      .terminate();
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      logger().error(
        {
          err: e,
        },
        "Failed to stop compute properties global workflow.",
      );
      throw e;
    }
    logger().info("Compute properties global scheduler workflow not found.");
  }
  try {
    await client.getHandle(COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID).terminate();
  } catch (e) {
    if (!(e instanceof WorkflowNotFoundError)) {
      logger().error(
        {
          err: e,
        },
        "Failed to stop compute properties global workflow.",
      );
      throw e;
    }
    logger().info("Compute properties queue workflow not found.");
  }
}

export async function startQueueWorkflow({
  client,
  ...params
}: {
  client: WorkflowClient;
} & Pick<ComputePropertiesQueueWorkflowParams, "continueAsNew">) {
  try {
    await client.start(computePropertiesQueueWorkflow, {
      taskQueue: config().computedPropertiesTaskQueue,
      workflowId: COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
      args: [params],
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger().error(
        {
          err: e,
        },
        "Failed to start compute properties queue workflow.",
      );
      throw e;
    }
    logger().info("Compute properties queue workflow already started.");
  }
}

export async function startComputePropertiesWorkflowGlobal() {
  const client = await connectWorkflowClient();
  await startQueueWorkflow({ client });
  try {
    await client.start(computePropertiesSchedulerWorkflow, {
      taskQueue: config().computedPropertiesTaskQueue,
      workflowId: COMPUTE_PROPERTIES_SCHEDULER_WORKFLOW_ID,
      args: [
        {
          queueWorkflowId: COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID,
        },
      ],
    });
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger().error(
        {
          err: e,
        },
        "Failed to start compute properties global workflow.",
      );
      throw e;
    }
    logger().info("Compute properties global workflow already started.");
  }
}

export async function signalComputePropertiesEarly({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const client = await connectWorkflowClient();
  try {
    logger().info(
      {
        workspaceId,
      },
      "Sending compute properties early signal",
    );
    await client
      .getHandle(generateComputePropertiesId(workspaceId))
      .signal(computePropertiesEarlySignal);
  } catch (e) {
    logger().error(
      {
        err: e,
        workspaceId,
      },
      "Failed to send compute properties early signal",
    );
    // Optionally re-throw or handle the error as needed
    throw e;
  }
}

export async function enqueueRecompute({
  items,
}: {
  items: WorkspaceQueueSignal["workspaces"];
}) {
  const client = await connectWorkflowClient();
  try {
    logger().info(
      {
        itemCount: items.length,
      },
      "Sending add workspaces v2 signal",
    );
    await client
      .getHandle(COMPUTE_PROPERTIES_QUEUE_WORKFLOW_ID)
      .signal(addWorkspacesSignalV2, { workspaces: items });
  } catch (e) {
    logger().error(
      {
        err: e,
        itemCount: items.length,
      },
      "Failed to send add workspaces v2 signal",
    );
    // Optionally re-throw or handle the error as needed
    throw e;
  }
}

export async function resetComputePropertiesWorkflows({
  workspaceId,
  all,
}: {
  workspaceId?: string;
  all?: boolean;
}) {
  let condition: SQL | undefined;
  if (!all && workspaceId) {
    const workspaceIds = workspaceId.split(",");
    condition = inArray(schema.workspace.id, workspaceIds);
  }
  const workspaces = await db().query.workspace.findMany({
    where: condition,
    with: {
      features: true,
    },
  });
  logger().info(
    {
      queue: config().computedPropertiesTaskQueue,
    },
    "Resetting computed properties workflows",
  );
  await Promise.all(
    workspaces.map(async (workspace) => {
      const isGlobal = workspace.features.some(
        (f) =>
          // defaults to true
          config().useGlobalComputedProperties !== false ||
          // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
          (f.name === FeatureNamesEnum.ComputePropertiesGlobal && f.enabled),
      );
      if (
        workspace.status !== WorkspaceStatusDbEnum.Active ||
        workspace.type === WorkspaceTypeAppEnum.Parent ||
        isGlobal
      ) {
        await terminateComputePropertiesWorkflow({
          workspaceId: workspace.id,
        });
        logger().info(
          {
            workspaceId: workspace.id,
            type: workspace.type,
            status: workspace.status,
            isGlobal,
          },
          "Terminated computed properties workflow",
        );
      } else {
        await resetComputePropertiesWorkflow({
          workspaceId: workspace.id,
        });
        logger().info(
          {
            workspaceId: workspace.id,
            type: workspace.type,
            status: workspace.status,
          },
          "Reset computed properties workflow",
        );
      }
    }),
  );
  logger().info("Done.");
}
