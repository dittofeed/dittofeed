import { FastifyRequest } from "fastify";
import { RoleEnum } from "isomorphic-lib/src/types";

/**
 * Returns true when the current member holds the Admin role in the workspace
 * backing the request. Roles are resolved per workspace, so a member may be an
 * Admin in one workspace and a Viewer in another.
 */
export function isWorkspaceAdmin(request: FastifyRequest): boolean {
  const workspace = request.requestContext.get("workspace");
  const memberRoles = request.requestContext.get("memberRoles");
  if (!workspace || !memberRoles) {
    return false;
  }
  return memberRoles.some(
    (role) => role.workspaceId === workspace.id && role.role === RoleEnum.Admin,
  );
}

/** Whether the caller may see raw (unmasked) PII in this workspace. */
export function canUnmaskPii(request: FastifyRequest): boolean {
  return request.requestContext.get("unmaskPii") ?? false;
}

/** Id of the calling workspace member, if the request is authenticated. */
export function getRequestMemberId(
  request: FastifyRequest,
): string | undefined {
  return request.requestContext.get("member")?.id;
}
