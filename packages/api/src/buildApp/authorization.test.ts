import { FastifyRequest } from "fastify";
import {
  Role,
  RoleEnum,
  WorkspaceMemberRoleResource,
} from "isomorphic-lib/src/types";

import {
  canUnmaskPii,
  getRequestMemberId,
  isWorkspaceAdmin,
} from "./authorization";

function makeRequest(context: Record<string, unknown>): FastifyRequest {
  const request = {
    requestContext: {
      get: (key: string) => context[key],
    },
  };
  // A minimal stand-in for the real fastify request: only the request-context
  // accessors that the helpers use are present.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return request as unknown as FastifyRequest;
}

function makeRole({
  workspaceId,
  role,
  unmaskPii = false,
}: {
  workspaceId: string;
  role: Role;
  unmaskPii?: boolean;
}): WorkspaceMemberRoleResource {
  return {
    workspaceId,
    workspaceMemberId: "member-1",
    workspaceName: "workspace",
    role,
    unmaskPii,
  };
}

describe("authorization", () => {
  const workspaceId = "workspace-1";
  const workspace = { id: workspaceId };

  describe("isWorkspaceAdmin", () => {
    it("returns true for an Admin of the current workspace", () => {
      const request = makeRequest({
        workspace,
        memberRoles: [makeRole({ workspaceId, role: RoleEnum.Admin })],
      });

      expect(isWorkspaceAdmin(request)).toBe(true);
    });

    it("returns false for a non-Admin of the current workspace", () => {
      const request = makeRequest({
        workspace,
        memberRoles: [
          makeRole({ workspaceId, role: RoleEnum.WorkspaceManager }),
        ],
      });

      expect(isWorkspaceAdmin(request)).toBe(false);
    });

    it("returns false when Admin only in another workspace", () => {
      const request = makeRequest({
        workspace,
        memberRoles: [
          makeRole({ workspaceId: "other-workspace", role: RoleEnum.Admin }),
        ],
      });

      expect(isWorkspaceAdmin(request)).toBe(false);
    });

    it("returns false when the request is unauthenticated", () => {
      expect(isWorkspaceAdmin(makeRequest({}))).toBe(false);
    });
  });

  describe("canUnmaskPii", () => {
    it("returns the value from the request context", () => {
      expect(canUnmaskPii(makeRequest({ unmaskPii: true }))).toBe(true);
      expect(canUnmaskPii(makeRequest({ unmaskPii: false }))).toBe(false);
    });

    it("fails closed when the permission is absent", () => {
      expect(canUnmaskPii(makeRequest({}))).toBe(false);
    });
  });

  describe("getRequestMemberId", () => {
    it("returns the member id", () => {
      expect(getRequestMemberId(makeRequest({ member: { id: "m-1" } }))).toBe(
        "m-1",
      );
    });

    it("returns undefined when there is no member", () => {
      expect(getRequestMemberId(makeRequest({}))).toBeUndefined();
    });
  });
});
