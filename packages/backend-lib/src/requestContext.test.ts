import { encodeMockJwt } from "../test/factories/jwt";

describe("getMultiTenantRequestContext", () => {
  describe("when auth role is missing", () => {
    it("returns an error", () => {
      const header = `Bearer ${encodeMockJwt({
        email: "example@email.com",
        email_verified: true,
      })}`;
    });

    describe("when workspace has a domain", () => {
      it("succeeds and creates a role for the user", () => {});
    });
  });
});
