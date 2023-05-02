import { err, ok, Result } from "neverthrow";

import { Role, RoleEnum } from "./types";

export const authCodes: Record<Role, number> = {
  [RoleEnum.Admin]: 10,
  [RoleEnum.WorkspaceManager]: 20,
  [RoleEnum.Author]: 30,
  [RoleEnum.Viewer]: 40,
};

export function isAuthorized({
  userRole,
  requiredRole,
}: {
  userRole: Role;
  requiredRole: Role;
}): Result<null, Error> {
  const userAuthCode = authCodes[userRole];
  const requiredRoleCode = authCodes[requiredRole];

  if (userAuthCode > requiredRoleCode) {
    return err(
      new Error(`is ${userRole}, but required ${requiredRole} or greater`)
    );
  }
  return ok(null);
}
