import { Static, TSchema, Type } from "@sinclair/typebox";
import { submitBatch } from "backend-lib/src/apps/batch";
import { db } from "backend-lib/src/db";
import {
  piiAccessAudit,
  userProperty,
  workspaceMember,
  workspaceMemberRole,
} from "backend-lib/src/db/schema";
import { createPiiFields } from "backend-lib/src/pii";
import {
  EventType,
  GetEventsResponse,
  GetPiiAccessAuditResponse,
  GetPiiFieldsResponse,
  GetUsersResponse,
  UserPropertyDefinitionType,
  WorkspaceTypeAppEnum,
} from "backend-lib/src/types";
import { insertUserPropertyAssignments } from "backend-lib/src/userProperties";
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
 * End-to-end coverage for the PII masking pipeline: real HTTP requests through
 * the fastify preHandler, workspace authorization, controllers and database.
 *
 * Requires a multi-tenant environment, because the member-level `unmaskPii`
 * permission is only resolved for authenticated members. Run with:
 *
 *   AUTH_MODE=multi-tenant AUTH_PROVIDER=test jest --selectProjects api \
 *     --testPathPattern piiAccess
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

const MaskedTraits = Type.Object({
  email: Type.String(),
  phone: Type.String(),
});

function first<T>(items: T[], what: string): T {
  const item = items[0];
  if (!item) {
    throw new Error(`expected ${what}`);
  }
  return item;
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

describe("PII access control", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let workspaceId: string;
  let emailPropertyId: string;
  let userId: string;

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

    userId = `user-${uuidv4()}`;
    emailPropertyId = uuidv4();
    await db()
      .insert(userProperty)
      .values({
        id: emailPropertyId,
        workspaceId,
        name: "email",
        updatedAt: new Date(),
        definition: {
          type: UserPropertyDefinitionType.Trait,
          path: "email",
        },
      });
    await insertUserPropertyAssignments([
      {
        userPropertyId: emailPropertyId,
        workspaceId,
        userId,
        value: JSON.stringify("alice@example.com"),
      },
    ]);

    await submitBatch(
      {
        workspaceId,
        data: {
          batch: [
            {
              type: EventType.Identify,
              messageId: uuidv4(),
              userId,
              traits: {
                email: "alice@example.com",
                phone: "+15551234567",
              },
            },
          ],
        },
      },
      { writeModeOverride: "ch-sync" },
    );

    await createPiiFields({
      workspaceId,
      fields: [
        { scope: "UserProperty", name: "email", category: "Email" },
        { scope: "EventProperty", name: "email", category: "Email" },
        { scope: "EventProperty", name: "phone", category: "Phone" },
        { scope: "Column", name: "UserEvents.userId", category: "Other" },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("when the member has not been granted unmaskPii", () => {
    let headers: Record<string, string>;
    beforeAll(async () => {
      headers = headersFor("masked.viewer@example.com", workspaceId);
      // Establish the member + role through a first request.
      await app.inject({
        method: "POST",
        url: "/api/users",
        headers,
        payload: { workspaceId, limit: 10 },
      });
    });

    it("masks registered user properties", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/users",
        headers,
        payload: { workspaceId, limit: 10 },
      });
      expect(response.statusCode).toBe(200);
      const body = parseBody(response.body, GetUsersResponse);
      const user = first(body.users, "a user");
      const property = user.properties[emailPropertyId];
      if (!property) {
        throw new Error("expected the email user property");
      }
      expect(property.name).toBe("email");
      expect(property.value).toBe("MASKED");
      expect(property.piiMasked).toBe(true);
    });

    it("masks event traits and the user id column", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/events?workspaceId=${workspaceId}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const body = parseBody(response.body, GetEventsResponse);
      const event = first(body.events, "an event");
      expect(event.userId).toBe("MASKED");
      const traits = parseBody(event.traits, MaskedTraits);
      expect(traits.email).toBe("MASKED");
      expect(traits.phone).toBe("MASKED");
    });

    it("masks the events csv export", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/events/download?workspaceId=${workspaceId}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("MASKED");
      expect(response.body).not.toContain("alice@example.com");
      expect(response.body).not.toContain("+15551234567");
    });

    it("does not write a pii access audit", async () => {
      const rows = await db()
        .select()
        .from(piiAccessAudit)
        .where(eq(piiAccessAudit.workspaceId, workspaceId));
      expect(rows).toHaveLength(0);
    });
  });

  describe("when the member is not a workspace admin", () => {
    let headers: Record<string, string>;
    beforeAll(async () => {
      headers = headersFor("viewer@example.com", workspaceId);
      await app.inject({
        method: "POST",
        url: "/api/users",
        headers,
        payload: { workspaceId, limit: 10 },
      });
      const member = await db().query.workspaceMember.findFirst({
        where: eq(workspaceMember.email, "viewer@example.com"),
      });
      if (!member) {
        throw new Error("expected the member to be created by the request");
      }
      // Auto-joined members are admins. Downgrade to a plain viewer so the
      // administration guards are exercised.
      await db()
        .update(workspaceMemberRole)
        .set({ role: "Viewer" })
        .where(
          and(
            eq(workspaceMemberRole.workspaceId, workspaceId),
            eq(workspaceMemberRole.workspaceMemberId, member.id),
          ),
        );
    });

    it("rejects pii field administration", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/pii/fields",
        headers,
        payload: {
          workspaceId,
          fields: [{ scope: "UserProperty", name: "phone" }],
        },
      });
      expect(response.statusCode).toBe(403);
    });

    it("rejects reading the pii access audit", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/pii/audit?workspaceId=${workspaceId}`,
        headers,
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe("when the member has been granted unmaskPii", () => {
    let headers: Record<string, string>;
    beforeAll(async () => {
      headers = headersFor("unmasked.viewer@example.com", workspaceId);
      await app.inject({
        method: "POST",
        url: "/api/users",
        headers,
        payload: { workspaceId, limit: 10 },
      });
      const member = await db().query.workspaceMember.findFirst({
        where: eq(workspaceMember.email, "unmasked.viewer@example.com"),
      });
      if (!member) {
        throw new Error("expected the member to be created by the request");
      }
      await db()
        .update(workspaceMemberRole)
        .set({ unmaskPii: true })
        .where(
          and(
            eq(workspaceMemberRole.workspaceId, workspaceId),
            eq(workspaceMemberRole.workspaceMemberId, member.id),
          ),
        );
    });

    it("returns raw user properties", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/users",
        headers,
        payload: { workspaceId, limit: 10 },
      });
      expect(response.statusCode).toBe(200);
      const body = parseBody(response.body, GetUsersResponse);
      const user = first(body.users, "a user");
      const property = user.properties[emailPropertyId];
      if (!property) {
        throw new Error("expected the email user property");
      }
      expect(property.value).toBe("alice@example.com");
      expect(property.piiMasked).toBeUndefined();
    });

    it("returns raw event traits", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/events?workspaceId=${workspaceId}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const body = parseBody(response.body, GetEventsResponse);
      const event = first(body.events, "an event");
      expect(event.userId).toBe(userId);
      const traits = parseBody(event.traits, MaskedTraits);
      expect(traits.email).toBe("alice@example.com");
      expect(traits.phone).toBe("+15551234567");
    });

    it("records plaintext access in the audit log", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/pii/audit?workspaceId=${workspaceId}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const { audits } = parseBody(response.body, GetPiiAccessAuditResponse);
      expect(audits.length).toBeGreaterThan(0);
      const actions = audits.map((audit: { action: string }) => audit.action);
      expect(actions).toContain("ViewUsers");
      expect(actions).toContain("ViewEvents");
      const userPropertyAudit = audits.find(
        (audit) => audit.action === "ViewUsers" && audit.fieldName === "email",
      );
      if (!userPropertyAudit) {
        throw new Error("expected a ViewUsers audit entry for the email field");
      }
      expect(userPropertyAudit.recordCount).toBeGreaterThan(0);
    });

    it("allows pii field administration", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/pii/fields",
        headers,
        payload: {
          workspaceId,
          fields: [{ scope: "UserProperty", name: "phone", category: "Phone" }],
        },
      });
      expect(response.statusCode).toBe(204);
      const fields = await app.inject({
        method: "GET",
        url: `/api/pii/fields?workspaceId=${workspaceId}&scope=UserProperty`,
        headers,
      });
      expect(fields.statusCode).toBe(200);
      const names = parseBody(fields.body, GetPiiFieldsResponse).fields.map(
        (field) => field.name,
      );
      expect(names).toContain("phone");
    });
  });
});
