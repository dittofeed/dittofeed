import { randomUUID } from "crypto";
import { RoleEnum } from "isomorphic-lib/src/types";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import config from "./config";
import {
  loginWithEmailPassword,
  LoginWithEmailPasswordErrorType,
  resolveAuthLoginMethods,
} from "./memberPasswordAuth";
import { createWorkspaceMemberRole } from "./rbac";
import { createWorkspace } from "./workspaces";

describe("memberPasswordAuth", () => {
  const run = config().authMode === "multi-tenant";

  (run ? describe : describe.skip)("multi-tenant password login", () => {
    it("resolveAuthLoginMethods enables password when member has a hash", async () => {
      const workspace = unwrap(
        await createWorkspace({
          id: randomUUID(),
          name: `ws-${randomUUID()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      const email = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Viewer,
        initialPassword: "loginpass123",
      });

      const methods = await resolveAuthLoginMethods(email);
      expect(methods.passwordEnabled).toBe(true);
    });

    it("loginWithEmailPassword returns a JWT when credentials and onboarding are valid", async () => {
      if (!config().secretKey) {
        return;
      }
      const workspace = unwrap(
        await createWorkspace({
          id: randomUUID(),
          name: `ws-${randomUUID()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      const email = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Viewer,
        initialPassword: "goodsecret123",
      });

      const result = await loginWithEmailPassword({
        email,
        password: "goodsecret123",
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.split(".")).toHaveLength(3);
      }
    });

    it("loginWithEmailPassword rejects wrong password", async () => {
      const workspace = unwrap(
        await createWorkspace({
          id: randomUUID(),
          name: `ws-${randomUUID()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      const email = `${randomUUID()}@example.com`;
      await createWorkspaceMemberRole({
        workspaceId: workspace.id,
        email,
        role: RoleEnum.Viewer,
        initialPassword: "rightpassword1",
      });

      const result = await loginWithEmailPassword({
        email,
        password: "wrongpassword1",
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe(
          LoginWithEmailPasswordErrorType.InvalidCredentials,
        );
      }
    });
  });
});
