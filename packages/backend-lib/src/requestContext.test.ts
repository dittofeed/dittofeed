import { randomUUID } from "crypto";

import { encodeMockJwt } from "../test/factories/jwt";
import { db } from "./db";
import {
  workspace as dbWorkspace,
  workspaceMember as dbWorkspaceMember,
  workspaceMemberRole as dbWorkspaceMemberRole,
} from "./db/schema";
import {
  findAndCreateRoles,
  getMultiTenantRequestContext,
} from "./requestContext";
import {
  RequestContextErrorType,
  RoleEnum,
  Workspace,
  WorkspaceMember,
} from "./types";

describe("requestContext", () => {
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
            updatedAt: new Date(),
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
          expect(result.error.type).toEqual(
            RequestContextErrorType.NotOnboarded,
          );
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
  describe("findAndCreateRoles", () => {
    describe("when a user is an admin of a parent workspace", () => {
      let parent: Workspace;
      let child: Workspace;
      let member: WorkspaceMember;

      beforeEach(async () => {
        parent = await db().insert(dbWorkspace).values({
          name: randomUUID(),
          type: "Parent",
        });
        child = await db().insert(dbWorkspace).values({
          name: randomUUID(),
          type: "Child",
          parentWorkspaceId: parent.id,
        });
        member = await db().insert(dbWorkspaceMember).values({
          email: "test@test.com",
          emailVerified: true,
        });
        await db().insert(dbWorkspaceMemberRole).values({
          workspaceMemberId: member.id,
          workspaceId: parent.id,
          role: RoleEnum.Admin,
        });
      });
      it("should return admin role for the child workspace", async () => {
        const result = await findAndCreateRoles(member);
        const childRole = result.memberRoles.find(
          (role) => role.workspaceId === child.id,
        );
        expect(childRole).not.toBeUndefined();
        expect(childRole?.role).toEqual(RoleEnum.Admin);
      });
    });
  });
});
