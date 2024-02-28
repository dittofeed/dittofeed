import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";

import prisma from "./prisma";
import {
  FeatureMap,
  FeatureMapEnum,
  FeatureNames,
  FeatureNamesEnum,
} from "./types";

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
  names: FeatureNamesEnum[];
}): Promise<FeatureMapEnum> {
  const features = await prisma().feature.findMany({
    where: {
      workspaceId,
      name: {
        in: names,
      },
    },
  });
  return features.reduce<FeatureMap>((acc, feature) => {
    const validated = schemaValidate(feature.name, FeatureNames);
    if (validated.isErr()) {
      return acc;
    }
    acc[validated.value] = feature.enabled;
    return acc;
  }, {});
}
