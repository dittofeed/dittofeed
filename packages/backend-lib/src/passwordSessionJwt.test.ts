import config from "./config";
import {
  decodeMultiTenantAuthToken,
  PASSWORD_JWT_SUB_PREFIX,
  signPasswordSessionJwt,
} from "./auth";

describe("password session JWT", () => {
  it("round-trips sub and email for verified password JWTs", () => {
    const cfg = config();
    if (cfg.authMode !== "multi-tenant" || !cfg.secretKey) {
      return;
    }

    const memberId = "00000000-0000-4000-8000-000000000042";
    const token = signPasswordSessionJwt({
      memberId,
      email: "member@example.com",
      emailVerified: true,
    });

    const profile = decodeMultiTenantAuthToken(`Bearer ${token}`);
    expect(profile).not.toBeNull();
    expect(profile?.sub).toBe(`${PASSWORD_JWT_SUB_PREFIX}${memberId}`);
    expect(profile?.email).toBe("member@example.com");
    expect(profile?.email_verified).toBe(true);
  });
});
