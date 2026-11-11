import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

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

        it("defaults unmaskPii to false for a newly auto-joined member", async () => {
          const result = await getMultiTenantRequestContext({
            authorizationToken: header,
            authProvider: "some-provider",
          });
          if (result.isErr()) {
            throw new Error(result.error.type);
          }
          expect(result.value.unmaskPii).toBe(false);
        });

        it("returns unmaskPii once an admin grants it", async () => {
          const first = await getMultiTenantRequestContext({
            authorizationToken: header,
            authProvider: "some-provider",
          });
          if (first.isErr()) {
            throw new Error(first.error.type);
          }
          await db()
            .update(dbWorkspaceMemberRole)
            .set({ unmaskPii: true })
            .where(
              eq(
                dbWorkspaceMemberRole.workspaceMemberId,
                first.value.member.id,
              ),
            );

          const second = await getMultiTenantRequestContext({
            authorizationToken: header,
            authProvider: "some-provider",
          });
          if (second.isErr()) {
            throw new Error(second.error.type);
          }
          expect(second.value.unmaskPii).toBe(true);
        });
      });
    });
  });
  describe("findAndCreateRoles", () => {
    describe("when a workspace has a public email domain", () => {
      it.each(["gmail.com", "yahoo.com", "outlook.com", "foo.gmail.com"])(
        "does not auto-join %s or persist a role",
        async (domain) => {
          await db().insert(dbWorkspace).values({ name: randomUUID(), domain });
          const [member] = await db()
            .insert(dbWorkspaceMember)
            .values({
              email: `${randomUUID()}@${domain}`,
              emailVerified: true,
            })
            .returning();
          if (!member) throw new Error("Expected member");

          const result = await findAndCreateRoles(member);

          expect(result.workspace).toBeNull();
          expect(result.memberRoles).toEqual([]);
          const roles = await db()
            .select()
            .from(dbWorkspaceMemberRole)
            .where(eq(dbWorkspaceMemberRole.workspaceMemberId, member.id));
          expect(roles).toEqual([]);
        },
      );

      it("preserves explicit membership without joining other Gmail workspaces", async () => {
        const [workspace] = await db()
          .insert(dbWorkspace)
          .values({
            name: randomUUID(),
            domain: "gmail.com",
          })
          .returning();
        await db()
          .insert(dbWorkspace)
          .values({ name: randomUUID(), domain: "gmail.com" });
        const [member] = await db()
          .insert(dbWorkspaceMember)
          .values({
            email: `${randomUUID()}@gmail.com`,
            emailVerified: true,
          })
          .returning();
        if (!workspace || !member)
          throw new Error("Expected workspace and member");
        const [role] = await db()
          .insert(dbWorkspaceMemberRole)
          .values({
            workspaceId: workspace.id,
            workspaceMemberId: member.id,
            role: RoleEnum.Admin,
          })
          .returning();

        const result = await findAndCreateRoles(member);

        expect(result.workspace?.id).toBe(workspace.id);
        expect(result.memberRoles).toEqual([
          expect.objectContaining({
            workspaceId: workspace.id,
            workspaceMemberId: member.id,
            role: RoleEnum.Admin,
          }),
        ]);
        const roles = await db()
          .select()
          .from(dbWorkspaceMemberRole)
          .where(eq(dbWorkspaceMemberRole.workspaceMemberId, member.id));
        expect(roles).toEqual([role]);
      });
    });
    describe("when a user is an admin of a parent workspace", () => {
      let parent: Workspace;
      let child: Workspace;
      let member: WorkspaceMember;

      beforeEach(async () => {
        const parentResult = await db()
          .insert(dbWorkspace)
          .values({
            name: randomUUID(),
            type: "Parent",
          })
          .returning();
        parent = parentResult[0]!;
        const childResult = await db()
          .insert(dbWorkspace)
          .values({
            name: randomUUID(),
            type: "Child",
            parentWorkspaceId: parent.id,
          })
          .returning();
        child = childResult[0]!;

        const memberResult = await db()
          .insert(dbWorkspaceMember)
          .values({
            email: "test@test.com",
            emailVerified: true,
          })
          .returning();
        member = memberResult[0]!;

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
    describe("when a parent role has the unmask PII permission", () => {
      it("inherits the permission for the child workspace", async () => {
        const [parent] = await db()
          .insert(dbWorkspace)
          .values({ name: randomUUID(), type: "Parent" })
          .returning();
        if (!parent) throw new Error("Expected parent workspace");
        const [child] = await db()
          .insert(dbWorkspace)
          .values({
            name: randomUUID(),
            type: "Child",
            parentWorkspaceId: parent.id,
          })
          .returning();
        if (!child) throw new Error("Expected child workspace");
        const [member] = await db()
          .insert(dbWorkspaceMember)
          .values({
            email: `${randomUUID()}@${randomUUID()}.com`,
            emailVerified: true,
          })
          .returning();
        if (!member) throw new Error("Expected member");
        await db().insert(dbWorkspaceMemberRole).values({
          workspaceMemberId: member.id,
          workspaceId: parent.id,
          role: RoleEnum.Admin,
          unmaskPii: true,
        });

        const result = await findAndCreateRoles(member);

        const childRole = result.memberRoles.find(
          (role) => role.workspaceId === child.id,
        );
        expect(childRole?.unmaskPii).toBe(true);
      });
    });
    describe("when a role has the unmask PII permission", () => {
      it("exposes unmaskPii on the role resource", async () => {
        const [workspace] = await db()
          .insert(dbWorkspace)
          .values({ name: randomUUID(), domain: `${randomUUID()}.com` })
          .returning();
        if (!workspace) throw new Error("Expected workspace");
        const [member] = await db()
          .insert(dbWorkspaceMember)
          .values({
            email: `${randomUUID()}@${randomUUID()}.com`,
            emailVerified: true,
          })
          .returning();
        if (!member) throw new Error("Expected member");
        await db().insert(dbWorkspaceMemberRole).values({
          workspaceId: workspace.id,
          workspaceMemberId: member.id,
          role: RoleEnum.Viewer,
          unmaskPii: true,
        });

        const result = await findAndCreateRoles(member);

        const role = result.memberRoles.find(
          (r) => r.workspaceId === workspace.id,
        );
        expect(role?.role).toEqual(RoleEnum.Viewer);
        expect(role?.unmaskPii).toBe(true);
      });

      it("defaults to false when the permission was never granted", async () => {
        const [workspace] = await db()
          .insert(dbWorkspace)
          .values({ name: randomUUID(), domain: `${randomUUID()}.com` })
          .returning();
        if (!workspace) throw new Error("Expected workspace");
        const [member] = await db()
          .insert(dbWorkspaceMember)
          .values({
            email: `${randomUUID()}@${randomUUID()}.com`,
            emailVerified: true,
          })
          .returning();
        if (!member) throw new Error("Expected member");
        await db().insert(dbWorkspaceMemberRole).values({
          workspaceId: workspace.id,
          workspaceMemberId: member.id,
          role: RoleEnum.Admin,
        });

        const result = await findAndCreateRoles(member);

        const role = result.memberRoles.find(
          (r) => r.workspaceId === workspace.id,
        );
        expect(role?.unmaskPii).toBe(false);
      });
    });
  });
});
