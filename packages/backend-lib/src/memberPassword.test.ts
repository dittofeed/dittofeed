import {
  assertPasswordPolicy,
  hasStoredPasswordHash,
  hashMemberPassword,
  MEMBER_PASSWORD_MIN_LENGTH,
  verifyMemberPassword,
} from "./memberPassword";

describe("memberPassword", () => {
  it("hasStoredPasswordHash is false for null, empty, and whitespace-only", () => {
    expect(hasStoredPasswordHash(null)).toBe(false);
    expect(hasStoredPasswordHash(undefined)).toBe(false);
    expect(hasStoredPasswordHash("")).toBe(false);
    expect(hasStoredPasswordHash("   ")).toBe(false);
  });

  it("hashes and verifies a password", async () => {
    const hash = await hashMemberPassword("correcthorsebatterystaple");
    expect(await verifyMemberPassword(hash, "correcthorsebatterystaple")).toBe(
      true,
    );
    expect(await verifyMemberPassword(hash, "wrong")).toBe(false);
  });

  it("verifyMemberPassword returns false for null hash", async () => {
    expect(await verifyMemberPassword(null, "x")).toBe(false);
  });

  it("assertPasswordPolicy rejects short passwords", () => {
    expect(() =>
      assertPasswordPolicy("x".repeat(MEMBER_PASSWORD_MIN_LENGTH - 1)),
    ).toThrow(/at least/);
  });

  it("assertPasswordPolicy rejects overly long passwords", () => {
    expect(() => assertPasswordPolicy("x".repeat(300))).toThrow(/too long/);
  });
});
