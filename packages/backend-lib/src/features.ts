import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";

import prisma from "./prisma";
import { FeatureMap, FeatureNames, FeatureNamesEnum, Features } from "./types";

export async function getFeature({
  name,
  workspaceId,
}: {
  workspaceId: string;
  name: FeatureNamesEnum;
}): Promise<boolean> {
  const feature = await prisma().feature.findUnique({
    where: {
      workspaceId_name: {
        workspaceId,
        name,
      },
    },
  });
  return feature?.enabled ?? false;
}

export async function getFeatures({
  names,
  workspaceId,
}: {
  workspaceId: string;
  names?: FeatureNamesEnum[];
}): Promise<FeatureMap> {
  const features = await prisma().feature.findMany({
    where: {
      workspaceId,
      ...(names ? { name: { in: names } } : {}),
    },
  });
  return features.reduce<FeatureMap>((acc, feature) => {
    const validated = schemaValidate(feature.name, FeatureNames);
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
  workspaceId,
  features,
}: {
  workspaceId: string;
  features: Features;
}) {
  await Promise.all(
    features.map((feature) =>
      prisma().feature.upsert({
        where: {
          workspaceId_name: {
            workspaceId,
            name: feature.type,
          },
        },
        create: {
          workspaceId,
          name: feature.type,
          enabled: true,
          config: feature,
        },
        update: {
          enabled: true,
          config: feature,
        },
      }),
    ),
  );
}
