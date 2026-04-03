/* eslint-disable @typescript-eslint/consistent-type-assertions -- test doubles use minimal mocks */
import backendConfig from "backend-lib/src/config";
import { FastifyReply, FastifyRequest } from "fastify";
import { RoleEnum } from "isomorphic-lib/src/types";

import { denyUnlessAtLeastRole } from "./workspaceRoleGuard";

jest.mock("backend-lib/src/config", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedBackendConfig = backendConfig as jest.MockedFunction<
  typeof backendConfig
>;

function mockRequestContext(workspaceId: string, memberRoles: unknown[]) {
  const map = new Map<string, unknown>([
    ["workspace", { id: workspaceId }],
    ["memberRoles", memberRoles],
  ]);
  return {
    requestContext: {
      get: (key: string) => map.get(key),
    },
  } as unknown as FastifyRequest;
}

function mockReply() {
  const send = jest.fn();
  const status = jest.fn().mockReturnValue({ send });
  return { status, send } as unknown as FastifyReply & {
    status: jest.Mock;
    send: jest.Mock;
  };
}

describe("denyUnlessAtLeastRole", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns false in non-multi-tenant auth mode without sending 403", () => {
    mockedBackendConfig.mockReturnValue({
      authMode: "single-tenant",
    } as ReturnType<typeof backendConfig>);
    const request = mockRequestContext("ws-1", []);
    const reply = mockReply();

    const denied = denyUnlessAtLeastRole(
      request,
      reply,
      RoleEnum.WorkspaceManager,
    );

    expect(denied).toBe(false);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it("denies with 403 when member is Viewer but WorkspaceManager is required", () => {
    mockedBackendConfig.mockReturnValue({
      authMode: "multi-tenant",
    } as ReturnType<typeof backendConfig>);
    const request = mockRequestContext("ws-1", [
      { workspaceId: "ws-1", role: RoleEnum.Viewer },
    ]);
    const reply = mockReply();

    const denied = denyUnlessAtLeastRole(
      request,
      reply,
      RoleEnum.WorkspaceManager,
    );

    expect(denied).toBe(true);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it("allows WorkspaceManager when WorkspaceManager is required", () => {
    mockedBackendConfig.mockReturnValue({
      authMode: "multi-tenant",
    } as ReturnType<typeof backendConfig>);
    const request = mockRequestContext("ws-1", [
      { workspaceId: "ws-1", role: RoleEnum.WorkspaceManager },
    ]);
    const reply = mockReply();

    const denied = denyUnlessAtLeastRole(
      request,
      reply,
      RoleEnum.WorkspaceManager,
    );

    expect(denied).toBe(false);
    expect(reply.status).not.toHaveBeenCalled();
  });
});
