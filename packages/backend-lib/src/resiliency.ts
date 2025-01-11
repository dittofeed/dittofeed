import { aliasedTable, and, eq, max } from "drizzle-orm";

import { query as chQuery } from "./clickhouse";
import config from "./config";
import { WORKSPACE_COMPUTE_LATENCY_METRIC } from "./constants";
import { db } from "./db";
import {
  computedPropertyPeriod as dbComputedPropertyPeriod,
  workspace as dbWorkspace,
} from "./db/schema";
import logger, { publicLogger } from "./logger";
import { getMeter } from "./openTelemetry";
import {
  ComputedPropertyStep,
  Workspace,
  WorkspaceStatusDbEnum,
} from "./types";

const PUBLIC_PREFIX = "DF_PUBLIC";

const PUBLIC_LOGS = {
  userCounts: `${PUBLIC_PREFIX}_USER_COUNTS`,
  messageCounts: `${PUBLIC_PREFIX}_MESSAGE_COUNTS`,
};

function observeWorkspaceComputeLatencyInner({
  workspaces,
  periods,
}: {
  workspaces: Workspace[];
  periods: { to: Date; workspaceId: string }[];
}) {
  const maxToByWorkspaceId = periods.reduce<Map<string, Date>>(
    (acc, period) => {
      acc.set(period.workspaceId, period.to);
      return acc;
    },
    new Map(),
  );

  const now = Date.now();

  const histogram = getMeter().createHistogram(
    WORKSPACE_COMPUTE_LATENCY_METRIC,
  );
  const { appVersion } = config();

  for (const workspace of workspaces) {
    const maxTo = maxToByWorkspaceId.get(workspace.id);
    if (!maxTo) {
      logger().info(
        {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        },
        `Could not find maxTo for workspace`,
      );
      continue;
    }
    const latency = now - maxTo.getTime();

    histogram.record(latency, {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      appVersion,
    });
    logger().info(
      {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        latency,
        appVersion,
      },
      "Observed workspace compute latency.",
    );
  }
}

/**
 * Deprecated
 */
export async function observeWorkspaceComputeLatency() {
  const periodsQuery = db()
    .select({
      workspaceId: dbComputedPropertyPeriod.workspaceId,
      to: max(dbComputedPropertyPeriod.to),
    })
    .from(dbComputedPropertyPeriod)
    .where(
      eq(
        dbComputedPropertyPeriod.step,
        ComputedPropertyStep.ProcessAssignments,
      ),
    )
    .groupBy(dbComputedPropertyPeriod.workspaceId);

  const workspacesQuery = db()
    .select()
    .from(dbWorkspace)
    .where(eq(dbWorkspace.status, WorkspaceStatusDbEnum.Active));

  const [rawPeriods, workspaces] = await Promise.all([
    periodsQuery,
    workspacesQuery,
  ]);

  const periods = rawPeriods.flatMap((row) => {
    if (!row.to) {
      logger().error(
        { workspaceId: row.workspaceId },
        "Could not find maxTo for workspace",
      );
      return [];
    }
    return {
      to: new Date(row.to),
      workspaceId: row.workspaceId,
    };
  });

  observeWorkspaceComputeLatencyInner({
    workspaces,
    periods,
  });
}

async function emitPublicSignals({ workspaces }: { workspaces: Workspace[] }) {
  const [userCountsRes, messageCountsRes] = await Promise.all([
    chQuery({
      query: `select workspace_id, uniq(user_id) as count from user_events_v2 group by workspace_id`,
      format: "JSONEachRow",
    }),
    chQuery({
      query: `select workspace_id, uniq(message_id) as count from user_events_v2 where event = 'DFInternalMessageSent'group by workspace_id`,
      format: "JSONEachRow",
    }),
  ]);

  const [userCountRows, messageCountRows] = await Promise.all([
    userCountsRes.json<{ workspace_id: string; count: string }>(),
    messageCountsRes.json<{ workspace_id: string; count: string }>(),
  ]);
  const userCounts: [string, number][] = [];

  for (const row of userCountRows) {
    const count = Number.parseInt(row.count, 10);
    if (Number.isNaN(count)) {
      publicLogger().error(
        { workspaceId: row.workspace_id, count: row.count },
        "Could not parse user count",
      );
      continue;
    }
    userCounts.push([row.workspace_id, count]);
  }

  const messageCounts: [string, number][] = [];

  for (const row of messageCountRows) {
    const count = Number.parseInt(row.count, 10);
    if (Number.isNaN(count)) {
      publicLogger().error(
        { workspaceId: row.workspace_id, count: row.count },
        "Could not parse message count",
      );
      continue;
    }
    messageCounts.push([row.workspace_id, count]);
  }

  const firstWorkspace = workspaces[0]?.id;

  for (const [workspaceId, count] of userCounts) {
    publicLogger().info(
      { workspaceId, count, firstWorkspace },
      PUBLIC_LOGS.userCounts,
    );
  }

  for (const [workspaceId, count] of messageCounts) {
    publicLogger().info(
      { workspaceId, count, firstWorkspace },
      PUBLIC_LOGS.messageCounts,
    );
  }
}

export async function findActiveWorkspaces(): Promise<{
  workspaces: Workspace[];
  periods: { to: Date; workspaceId: string }[];
}> {
  const w = aliasedTable(dbWorkspace, "w");
  const cpp = aliasedTable(dbComputedPropertyPeriod, "cpp");
  const periodsQuery = db()
    .select({
      workspaceId: cpp.workspaceId,
      to: max(cpp.to),
    })
    .from(cpp)
    .innerJoin(w, eq(cpp.workspaceId, w.id))
    .where(
      and(
        eq(cpp.step, ComputedPropertyStep.ComputeAssignments),
        eq(w.status, WorkspaceStatusDbEnum.Active),
      ),
    )
    .groupBy(cpp.workspaceId);
  const workspacesQuery = db()
    .select()
    .from(w)
    .where(eq(w.status, WorkspaceStatusDbEnum.Active));

  const [periodsRaw, workspaces] = await Promise.all([
    periodsQuery,
    workspacesQuery,
  ]);

  const periods = periodsRaw.flatMap((row) => {
    if (!row.to) {
      logger().error(
        { workspaceId: row.workspaceId },
        "Could not find maxTo for workspace",
      );
      return [];
    }
    return {
      to: new Date(row.to),
      workspaceId: row.workspaceId,
    };
  });

  return {
    workspaces,
    periods,
  };
}

export async function emitGlobalSignals() {
  logger().info("Emitting global signals");
  const { workspaces, periods } = await findActiveWorkspaces();

  observeWorkspaceComputeLatencyInner({
    workspaces,
    periods,
  });

  const { dittofeedTelemetryDisabled } = config();

  if (!dittofeedTelemetryDisabled) {
    await emitPublicSignals({
      workspaces,
    });
  }
}
