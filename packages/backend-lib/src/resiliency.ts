import { ComputedPropertyStep } from "./computedProperties/computePropertiesIncremental";
import config from "./config";
import logger from "./logger";
import { getMeter } from "./openTelemetry";
import prisma, { Prisma } from "./prisma";

export async function observeWorkspaceComputeLatency() {
  const [periods, workspaces] = await Promise.all([
    (async () => {
      const periodsQuery = Prisma.sql`
        SELECT
          "workspaceId",
          MAX("to")
        FROM "ComputedPropertyPeriod"
        WHERE
          "step" = ${ComputedPropertyStep.ProcessAssignments}
        GROUP BY "workspaceId";
      `;
      return prisma().$queryRaw<{ to: Date; workspaceId: string }[]>(
        periodsQuery
      );
    })(),
    prisma().workspace.findMany(),
  ]);

  const maxToByWorkspaceId = periods.reduce<Map<string, Date>>(
    (acc, period) => {
      acc.set(period.workspaceId, period.to);
      return acc;
    },
    new Map()
  );

  const now = Date.now();
  for (const workspace of workspaces) {
    const maxTo = maxToByWorkspaceId.get(workspace.id);
    if (!maxTo) {
      logger().info(
        {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        },
        `Could not find maxTo for workspace`
      );
      continue;
    }
    const latency = now - maxTo.getTime();

    if (config().startOtel) {
      const histogram = getMeter().createHistogram("workspace_compute_latency");
      histogram.record(latency, {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      });
    }
    logger().info(
      {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        latency,
      },
      "Observed workspace compute latency."
    );
  }
}
