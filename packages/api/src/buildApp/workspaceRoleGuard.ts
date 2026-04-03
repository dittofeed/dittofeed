import backendConfig from "backend-lib/src/config";
import { FastifyReply, FastifyRequest } from "fastify";
import { Role } from "isomorphic-lib/src/types";
import { requireWorkspaceAtLeastRole } from "isomorphic-lib/src/workspaceRoles";

/**
 * Multi-tenant workspace RBAC: deny if the member's role in the active workspace
 * is weaker than `minimumRole`. No-op when not in multi-tenant mode.
 *
 * @returns true if the request was denied (403 sent); false if the handler may proceed.
 */
export function denyUnlessAtLeastRole(
  request: FastifyRequest,
  reply: FastifyReply,
  minimumRole: Role,
): boolean {
  if (backendConfig().authMode !== "multi-tenant") {
    return false;
  }
  const workspace = request.requestContext.get("workspace");
  const workspaceId =
    workspace &&
    typeof workspace === "object" &&
    workspace !== null &&
    "id" in workspace &&
    typeof (workspace as { id: unknown }).id === "string"
      ? (workspace as { id: string }).id
      : undefined;
  if (!workspaceId) {
    void reply.status(403).send();
    return true;
  }
  const memberRoles = request.requestContext.get("memberRoles") ?? [];
  if (
    requireWorkspaceAtLeastRole({
      memberRoles,
      workspaceId,
      minimumRole,
    }).isErr()
  ) {
    void reply.status(403).send();
    return true;
  }
  return false;
}
