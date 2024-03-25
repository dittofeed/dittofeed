import { command } from "backend-lib/src/clickhouse";
import logger from "backend-lib/src/logger";
import prisma from "backend-lib/src/prisma";
import {
  startComputePropertiesWorkflow,
  terminateComputePropertiesWorkflow,
} from "backend-lib/src/segments/computePropertiesWorkflow/lifecycle";
import {
  EmailProviderSecret,
  EmailProviderType,
  Workspace,
} from "backend-lib/src/types";
import { createUserEventsTables } from "backend-lib/src/userEvents/clickhouse";
import { SecretNames } from "isomorphic-lib/src/constants";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { spawnWithEnv, spawnWithEnvSafe } from "./spawn";

export async function disentangleResendSendgrid() {
  logger().info("Disentangling resend and sendgrid email providers.");
  await prisma().$transaction(async (pTx) => {
    const emailProviders = await pTx.emailProvider.findMany({
      where: {
        type: {
          in: [EmailProviderType.Sendgrid, EmailProviderType.Resend],
        },
      },
      include: {
        secret: true,
      },
    });
    const misnamedValues = emailProviders.flatMap((ep) => {
      if (!ep.secret?.configValue) {
        logger().error(
          {
            emailProvider: ep,
          },
          "email provider has no secret",
        );
        return [];
      }
      const secret = schemaValidateWithErr(
        ep.secret.configValue,
        EmailProviderSecret,
      );
      if (secret.isErr()) {
        logger().error(
          {
            err: secret.error,
            emailProviderId: ep.id,
          },
          "failed to validate secret",
        );
        return [];
      }
      const secretValue = secret.value;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      if (ep.type === secretValue.type) {
        return [];
      }
      return {
        workspaceId: ep.workspaceId,
        emailProviderId: ep.id,
        emailProviderType: ep.type,
        secretId: ep.secret.id,
        secretName: ep.secret.name,
        secretValue,
      };
    });
    const promises: Promise<unknown>[] = [];
    for (const misnamed of misnamedValues) {
      logger().info(
        {
          workspaceId: misnamed.workspaceId,
          emailProviderId: misnamed.emailProviderId,
          emailProviderType: misnamed.emailProviderType,
          secretId: misnamed.secretId,
          secretName: misnamed.secretName,
          secretValueType: misnamed.secretValue.type,
        },
        "Misnamed.",
      );
      if (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        misnamed.emailProviderType === EmailProviderType.Resend &&
        misnamed.secretValue.type === EmailProviderType.Sendgrid
      ) {
        logger().info("Correcting Resend email provider.");
        promises.push(
          (async () => {
            const secret = await pTx.secret.create({
              data: {
                name: SecretNames.Resend,
                workspaceId: misnamed.workspaceId,
                configValue: { type: EmailProviderType.Resend },
              },
            });
            await pTx.emailProvider.update({
              where: {
                id: misnamed.emailProviderId,
              },
              data: {
                secretId: secret.id,
              },
            });
          })(),
        );
      } else if (
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        misnamed.emailProviderType === EmailProviderType.Sendgrid &&
        misnamed.secretValue.type === EmailProviderType.Resend
      ) {
        logger().info("Correcting Sendgrid email provider.");
        promises.push(
          (async () => {
            const secret = await pTx.secret.create({
              data: {
                name: SecretNames.Resend,
                workspaceId: misnamed.workspaceId,
                configValue: misnamed.secretValue,
              },
            });
            await pTx.emailProvider.update({
              where: {
                workspaceId_type: {
                  type: EmailProviderType.Resend,
                  workspaceId: misnamed.workspaceId,
                },
              },
              data: {
                secretId: secret.id,
              },
            });
            await pTx.secret.update({
              where: {
                workspaceId_name: {
                  workspaceId: misnamed.workspaceId,
                  name: SecretNames.Sendgrid,
                },
              },
              data: {
                configValue: { type: EmailProviderType.Sendgrid },
              },
            });
          })(),
        );
      }
    }
    await Promise.all(promises);
  });
  logger().info("Done.");
}

async function upgradeWorkspaceV010Pre(workspace: Workspace) {
  logger().info(
    {
      workspaceName: workspace.name,
    },
    "Performing pre-upgrade steps for workspace",
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
    "Performing post-upgrade steps for workspace",
  );
  await startComputePropertiesWorkflow({ workspaceId: workspace.id });
}

export async function upgradeV010Post() {
  logger().info("Performing post-upgrade steps for v0.10.0");
  await prisma().computedPropertyPeriod.deleteMany({});
  const workspaces = await prisma().workspace.findMany();
  await Promise.all(workspaces.map(upgradeWorkspaceV010Post));
  await command({
    query: "drop view if exists updated_computed_property_state_mv;",
    clickhouse_settings: { wait_end_of_query: 1 },
  });
  logger().info("Performing post-upgrade steps for v0.10.0 completed.");
}

export async function upgradeV012Pre() {
  logger().info("Performing pre-upgrade steps for v0.12.0");

  await disentangleResendSendgrid();

  await spawnWithEnvSafe([
    "yarn",
    "workspace",
    "backend-lib",
    "prisma",
    "migrate",
    "deploy",
  ]);
  logger().info("Pre-upgrade steps for v0.12.0 completed.");
}
