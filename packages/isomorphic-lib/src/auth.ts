import { err, ok, Result } from "neverthrow";

import { Role } from "./types";

export const authCodes: Record<Role, number> = {
  [Role.Admin]: 10,
  [Role.WorkspaceManager]: 20,
  [Role.Author]: 30,
  [Role.Viewer]: 40,
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
