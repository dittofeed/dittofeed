import { Static, TSchema, Type } from "@sinclair/typebox";
import { db } from "backend-lib/src/db";
import {
  workspaceMember,
  workspaceMemberRole,
} from "backend-lib/src/db/schema";
import {
  GetWorkspaceMemberRolesResponse,
  WorkspaceTypeAppEnum,
} from "backend-lib/src/types";
import { createWorkspace } from "backend-lib/src/workspaces";
import { and, eq } from "drizzle-orm";
import { createSigner } from "fast-jwt";
import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants/headers";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  jsonParseSafe,
  schemaValidateWithErr,
} from "isomorphic-lib/src/resultHandling/schemaValidation";
import { v4 as uuidv4 } from "uuid";

import buildApp from "../buildApp";

/**
 * End-to-end coverage for workspace roles: members who join through their
 * email domain start as viewers, settings writes require the admin role, and
 * the last remaining admin cannot be demoted.
 *
 * Requires a multi-tenant environment, because member roles are only resolved
 * for authenticated members. Run with:
 *
 *   AUTH_MODE=multi-tenant AUTH_PROVIDER=test jest --selectProjects api \
 *     --testPathPattern permissionsAuthorization
 */

const signer = createSigner({ algorithm: "none" });

function encodeJwt(email: string): string {
  return signer({
    iss: "https://yourdomain.eu.auth0.com/",
    sub: `auth0|${email}`,
    aud: ["https://api.myapp.com"],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    scope: "openid profile email",
    email,
    email_verified: true,
    name: email,
    nickname: email,
  });
}

function parseBody<S extends TSchema>(body: string, schema: S): Static<S> {
  const parsed = unwrap(jsonParseSafe(body, { method: "standard" }));
  return unwrap(schemaValidateWithErr(parsed, schema));
}

function headersFor(email: string, workspaceId: string) {
  return {
    authorization: `Bearer ${encodeJwt(email)}`,
    [WORKSPACE_ID_HEADER]: workspaceId,
  };
}

async function promoteToAdmin(workspaceId: string, email: string) {
  const member = await db().query.workspaceMember.findFirst({
    where: eq(workspaceMember.email, email),
  });
  if (!member) {
    throw new Error(`expected a workspace member for ${email}`);
  }
  await db()
    .update(workspaceMemberRole)
    .set({ role: "Admin" })
    .where(
      and(
        eq(workspaceMemberRole.workspaceId, workspaceId),
        eq(workspaceMemberRole.workspaceMemberId, member.id),
      ),
    );
}

describe("workspace role authorization", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let workspaceId: string;

  beforeAll(async () => {
    app = await buildApp();
    workspaceId = uuidv4();
    unwrap(
      await createWorkspace({
        id: workspaceId,
        name: `workspace-${workspaceId}`,
        domain: "example.com",
        type: WorkspaceTypeAppEnum.Root,
        updatedAt: new Date(),
        createdAt: new Date(),
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe("when the member joins through their email domain", () => {
    let email: string;
    let headers: Record<string, string>;

    beforeAll(async () => {
      email = `viewer-${uuidv4()}@example.com`;
      headers = headersFor(email, workspaceId);
      // Establish the member and their role through a first request.
      await app.inject({
        method: "GET",
        url: `/api/permissions?workspaceId=${workspaceId}`,
        headers,
      });
    });

    it("assigns the read-only viewer role", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/permissions?workspaceId=${workspaceId}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const body = parseBody(response.body, GetWorkspaceMemberRolesResponse);
      const entry = body.memberRoles.find((m) => m.member.email === email);
      expect(entry?.roles[0]?.role).toBe("Viewer");
    });

    it("rejects settings writes", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/api/settings/write-keys",
        headers,
        payload: { workspaceId, writeKeyName: "viewer-write-key" },
      });
      expect(response.statusCode).toBe(403);
    });

    it("rejects permission changes", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/permissions",
        headers,
        payload: {
          workspaceId,
          email: `other-${uuidv4()}@example.com`,
          role: "Viewer",
        },
      });
      expect(response.statusCode).toBe(403);
    });

    it("allows settings writes once promoted to admin", async () => {
      await promoteToAdmin(workspaceId, email);

      const response = await app.inject({
        method: "PUT",
        url: "/api/settings/write-keys",
        headers,
        payload: { workspaceId, writeKeyName: "admin-write-key" },
      });
      expect(response.statusCode).toBe(204);
    });

    it("refuses to demote the last admin", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/api/permissions",
        headers,
        payload: { workspaceId, email, role: "Viewer" },
      });
      expect(response.statusCode).toBe(400);
      const body = parseBody(
        response.body,
        Type.Object({ message: Type.String() }),
      );
      expect(body.message).toContain("last workspace admin");
    });
  });
});
