import bootstrap from "backend-lib/src/bootstrap";
import backendConfig from "backend-lib/src/config";
import { NodeEnvEnum } from "backend-lib/src/config/loader";
import { Argv } from "yargs";

export const BOOTSTRAP_OPTIONS = {
  "workspace-name": {
    type: "string",
    alias: "n",
    describe: "The workspace name to bootstrap.",
  },
  "workspace-domain": {
    type: "string",
    alias: "d",
    describe:
      "The email domain to authorize. All users with the provided email domain will be able to access the workspace. Example: -d=example.com",
  },
} as const;

export function boostrapOptions(cmd: Argv) {
  return cmd.options(BOOTSTRAP_OPTIONS);
}

export async function bootstrapHandler({
  workspaceName,
  workspaceDomain,
}: {
  workspaceName?: string;
  workspaceDomain?: string;
}) {
  const workspaceNameWithDefault =
    backendConfig().nodeEnv === NodeEnvEnum.Development
      ? "Default"
      : workspaceName;
  if (!workspaceNameWithDefault) {
    throw new Error("Please provide a workspace name with --workspace-name");
  }

  await bootstrap({
    workspaceName: workspaceNameWithDefault,
    workspaceDomain,
  });
}
