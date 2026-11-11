import {
  getPiiPolicy,
  maskUserProperties,
  recordPiiAccess,
} from "backend-lib/src/pii";
import {
  DFRequestContext,
  GetUsersResponseItem,
  PiiFieldScopeEnum,
} from "backend-lib/src/types";

/**
 * Applies the workspace PII policy to users rendered by a server-side page.
 * Mirrors the masking performed by the API controllers so the browser never
 * receives plaintext values for members without `unmaskPii`.
 */
export async function maskUsersForViewer({
  users,
  dfContext,
  action,
}: {
  users: GetUsersResponseItem[];
  dfContext: DFRequestContext;
  action: string;
}): Promise<GetUsersResponseItem[]> {
  const policy = await getPiiPolicy(dfContext.workspace.id);
  const maskedFieldNames = new Set<string>();

  const maskedUsers = users.map((user) => {
    const result = maskUserProperties({
      properties: user.properties,
      policy,
      apply: !dfContext.unmaskPii,
    });
    result.maskedFieldNames.forEach((name) => maskedFieldNames.add(name));
    return { ...user, properties: result.properties };
  });

  await recordPiiAccess({
    viewer: {
      workspaceId: dfContext.workspace.id,
      workspaceMemberId: dfContext.member.id,
      unmaskPii: dfContext.unmaskPii,
    },
    action,
    scope: PiiFieldScopeEnum.UserProperty,
    fields: maskedFieldNames,
    resourceIds: users.map((user) => user.id),
  });

  return maskedUsers;
}
