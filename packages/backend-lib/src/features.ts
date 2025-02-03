import { Static } from "@sinclair/typebox";
import { and, eq, inArray, SQL } from "drizzle-orm";
import {
  schemaValidate,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";

import {
  startComputePropertiesWorkflow,
  terminateComputePropertiesWorkflow,
} from "./computedProperties/computePropertiesWorkflow/lifecycle";
import { db } from "./db";
import { feature as dbFeature } from "./db/schema";
import logger from "./logger";
import {
  FeatureConfigByType,
  FeatureMap,
  FeatureName,
  FeatureNamesEnum,
  Features,
} from "./types";

export async function getFeature({
  name,
  workspaceId,
}: {
  workspaceId: string;
  name: FeatureName;
}): Promise<boolean> {
  const feature = await db().query.feature.findFirst({
    where: and(
      eq(dbFeature.workspaceId, workspaceId),
      eq(dbFeature.name, name),
    ),
  });
  return feature?.enabled ?? false;
}

export async function getFeatureConfig<T extends FeatureName>({
  name,
  workspaceId,
}: {
  workspaceId: string;
  name: T;
}): Promise<Static<(typeof FeatureConfigByType)[T]> | null> {
  const feature = await db().query.feature.findFirst({
    where: and(
      eq(dbFeature.workspaceId, workspaceId),
      eq(dbFeature.name, name),
    ),
  });
  if (!feature?.enabled) {
    return null;
  }
  const validated = schemaValidateWithErr(
    feature.config,
    FeatureConfigByType[name],
  );
  if (validated.isErr()) {
    logger().error(
      {
        err: validated.error,
        workspaceId,
        name,
        feature,
      },
      "Feature config is not valid",
    );
    return null;
  }
  return validated.value;
}

export async function getFeatures({
  names,
  workspaceId,
}: {
  workspaceId: string;
  names?: FeatureName[];
}): Promise<FeatureMap> {
  const conditions: SQL[] = [eq(dbFeature.workspaceId, workspaceId)];
  if (names) {
    conditions.push(inArray(dbFeature.name, names));
  }
  const features = await db().query.feature.findMany({
    where: and(...conditions),
  });
  return features.reduce<FeatureMap>((acc, feature) => {
    const validated = schemaValidate(feature.name, FeatureName);
    if (validated.isErr()) {
      return acc;
    }
    if (!feature.enabled) {
      acc[validated.value] = false;
      return acc;
    }
    if (feature.config && typeof feature.config === "object") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      acc[validated.value] = feature.config;
      return acc;
    }
    acc[validated.value] = feature.enabled;
    return acc;
  }, {});
}

export async function addFeatures({
  workspaceId: workspaceIdInput,
  features,
}: {
  workspaceId: string | string[];
  features: Features;
}) {
  const workspaceIds = Array.isArray(workspaceIdInput)
    ? workspaceIdInput
    : [workspaceIdInput];
  logger().debug({ workspaceIds, features }, "Adding features");
  await Promise.all(
    workspaceIds.flatMap((workspaceId) =>
      features.map((feature) => {
        logger().debug({ workspaceId, feature }, "Adding feature");
        return db()
          .insert(dbFeature)
          .values({
            workspaceId,
            name: feature.type,
            enabled: true,
            config: feature,
          })
          .onConflictDoUpdate({
            target: [dbFeature.workspaceId, dbFeature.name],
            set: {
              enabled: true,
              config: feature,
            },
          });
      }),
    ),
  );

  const effects = workspaceIds.flatMap((workspaceId) =>
    features.flatMap((feature) => {
      switch (feature.type) {
        case FeatureNamesEnum.ComputePropertiesGlobal:
          return terminateComputePropertiesWorkflow({ workspaceId });
        default:
          return [];
      }
    }),
  );
  await Promise.all(effects);
}

export async function removeFeatures({
  workspaceId: workspaceIdInput,
  names,
}: {
  workspaceId: string | string[];
  names: FeatureName[];
}) {
  const workspaceIds = Array.isArray(workspaceIdInput)
    ? workspaceIdInput
    : [workspaceIdInput];
  await db()
    .delete(dbFeature)
    .where(
      and(
        inArray(dbFeature.workspaceId, workspaceIds),
        inArray(dbFeature.name, names),
      ),
    );

  const effects = workspaceIds.flatMap((workspaceId) =>
    names.flatMap((name) => {
      switch (name) {
        case FeatureNamesEnum.ComputePropertiesGlobal:
          return startComputePropertiesWorkflow({ workspaceId });
        default:
          return [];
      }
    }),
  );
  await Promise.all(effects);
}
