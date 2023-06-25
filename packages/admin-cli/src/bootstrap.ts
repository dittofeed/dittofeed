import bootstrap from "backend-lib/src/bootstrap";
import backendConfig from "backend-lib/src/config";

export async function bootstrapCommand({
  workspaceId,
  workspaceName,
  workspaceDomain,
}: {
  workspaceId?: string;
  workspaceName?: string;
  workspaceDomain?: string;
}) {
  return bootstrap({
    workspaceId: workspaceId ?? backendConfig().defaultWorkspaceId,
    workspaceName: workspaceName ?? "Default",
    workspaceDomain,
  });
}
