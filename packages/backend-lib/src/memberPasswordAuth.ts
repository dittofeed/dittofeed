import { eq } from "drizzle-orm";
import { err, ok, Result } from "neverthrow";

import { signPasswordSessionJwt } from "./auth";
import config from "./config";
import { db } from "./db";
import { workspaceMember as dbWorkspaceMember } from "./db/schema";
import { findAndCreateRoles } from "./requestContext";
import { hasStoredPasswordHash, verifyMemberPassword } from "./memberPassword";

export enum LoginWithEmailPasswordErrorType {
  FeatureDisabled = "FeatureDisabled",
  InvalidCredentials = "InvalidCredentials",
  NotOnboarded = "NotOnboarded",
  EmailNotVerified = "EmailNotVerified",
}

export type LoginWithEmailPasswordError =
  | { type: LoginWithEmailPasswordErrorType.FeatureDisabled }
  | { type: LoginWithEmailPasswordErrorType.InvalidCredentials }
  | { type: LoginWithEmailPasswordErrorType.NotOnboarded }
  | { type: LoginWithEmailPasswordErrorType.EmailNotVerified };

const LOGIN_METHODS_MIN_DELAY_MS = 80;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function resolveAuthLoginMethods(emailRaw: string): Promise<{
  passwordEnabled: boolean;
  oidcEnabled: boolean;
}> {
  const started = Date.now();
  const cfg = config();
  const email = emailRaw.trim();
  const oidcEnabled = Boolean(
    cfg.openIdAuthorizationUrl && cfg.openIdClientId,
  );

  let passwordEnabled = false;
  if (cfg.authMode === "multi-tenant" && cfg.enablePasswordLogin && email) {
    const member = await db().query.workspaceMember.findFirst({
      where: eq(dbWorkspaceMember.email, email),
    });
    passwordEnabled = hasStoredPasswordHash(member?.passwordHash);
  }

  const elapsed = Date.now() - started;
  if (elapsed < LOGIN_METHODS_MIN_DELAY_MS) {
    await sleep(LOGIN_METHODS_MIN_DELAY_MS - elapsed);
  }

  return { passwordEnabled, oidcEnabled };
}

export async function loginWithEmailPassword({
  email: emailRaw,
  password,
}: {
  email: string;
  password: string;
}): Promise<Result<string, LoginWithEmailPasswordError>> {
  const cfg = config();
  if (cfg.authMode !== "multi-tenant" || !cfg.enablePasswordLogin) {
    return err({ type: LoginWithEmailPasswordErrorType.FeatureDisabled });
  }

  const email = emailRaw.trim();
  const member = await db().query.workspaceMember.findFirst({
    where: eq(dbWorkspaceMember.email, email),
  });

  if (!member) {
    return err({ type: LoginWithEmailPasswordErrorType.InvalidCredentials });
  }

  if (
    !hasStoredPasswordHash(member.passwordHash) ||
    !(await verifyMemberPassword(member.passwordHash, password))
  ) {
    return err({ type: LoginWithEmailPasswordErrorType.InvalidCredentials });
  }

  const { workspace } = await findAndCreateRoles(member);
  if (!workspace || !member.email) {
    return err({ type: LoginWithEmailPasswordErrorType.NotOnboarded });
  }

  // Successful password check proves account control; session must satisfy
  // getMultiTenantRequestContext email gate (OIDC uses IdP verification).
  const token = signPasswordSessionJwt({
    memberId: member.id,
    email: member.email,
    emailVerified: true,
  });
  return ok(token);
}
