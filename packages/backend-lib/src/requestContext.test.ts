import { randomUUID } from "crypto";

import { encodeMockJwt } from "../test/factories/jwt";
import { db } from "./db";
import { workspace as dbWorkspace } from "./db/schema";
import { getMultiTenantRequestContext } from "./requestContext";
import { RequestContextErrorType, RoleEnum } from "./types";

describe("getMultiTenantRequestContext", () => {
  describe("when auth role is missing", () => {
    let header: string;
    let emailDomain: string;

    beforeEach(() => {
      emailDomain = `${randomUUID()}.com`;
      header = `Bearer ${encodeMockJwt({
        email: `${randomUUID()}@${emailDomain}`,
        email_verified: true,
      })}`;
    });

    describe("without a domain", () => {
      beforeEach(async () => {
        await db().insert(dbWorkspace).values({
          name: randomUUID(),
          domain: null,
        });
      });
      it("returns an error", async () => {
        const result = await getMultiTenantRequestContext({
          authorizationToken: header,
          authProvider: "some-provider",
        });
        if (result.isOk()) {
          throw new Error("Expected error");
        }
        expect(result.error.type).toEqual(RequestContextErrorType.NotOnboarded);
      });
    });

    describe("when workspace has a domain", () => {
      beforeEach(async () => {
        await db().insert(dbWorkspace).values({
          name: randomUUID(),
          domain: emailDomain,
        });
      });
      it("succeeds and creates a role for the user", async () => {
        const result = await getMultiTenantRequestContext({
          authorizationToken: header,
          authProvider: "some-provider",
        });
        if (result.isErr()) {
          throw new Error(result.error.type);
        }
        expect(result.value.memberRoles[0]?.role).toEqual(RoleEnum.Admin);
      });
    });
  });
});
