import argon2 from "argon2";

export const MEMBER_PASSWORD_MIN_LENGTH = 8;
export const MEMBER_PASSWORD_MAX_LENGTH = 256;

/** True when a non-empty password hash is stored (ignores whitespace-only values). */
export function hasStoredPasswordHash(
  hash: string | null | undefined,
): boolean {
  return typeof hash === "string" && hash.trim().length > 0;
}

export async function hashMemberPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyMemberPassword(
  hash: string | null | undefined,
  plain: string,
): Promise<boolean> {
  if (!hash) {
    return false;
  }
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < MEMBER_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Password must be at least ${MEMBER_PASSWORD_MIN_LENGTH} characters`,
    );
  }
  if (password.length > MEMBER_PASSWORD_MAX_LENGTH) {
    throw new Error("Password is too long");
  }
}
