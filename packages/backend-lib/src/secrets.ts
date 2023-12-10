import { isStringPresent } from "isomorphic-lib/src/strings";

import prisma from "./prisma";
import { SecretAvailabilityResource } from "./types";

export async function getSecretAvailability({
  workspaceId,
  names,
}: {
  workspaceId: string;
  names?: string[];
}): Promise<SecretAvailabilityResource[]> {
  const secrets = await prisma().secret.findMany({
    where: {
      workspaceId,
      name: {
        in: names,
      },
    },
  });
  return secrets.map((secret) => {
    let configValue: Record<string, boolean> | undefined;
    if (secret.configValue) {
      const existingConfigValue = secret.configValue as Record<string, string>;
      configValue = {};
      for (const key in existingConfigValue) {
        configValue[key] = isStringPresent(existingConfigValue[key]);
      }
    } else {
      configValue = undefined;
    }
    return {
      workspaceId: secret.workspaceId,
      name: secret.name,
      value: isStringPresent(secret.value),
      configValue,
    };
  });
}
