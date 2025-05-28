import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { db } from "../db";
import { EmailProviderType } from "../types";
import { createWorkspace } from "../workspaces";
import { upsertEmailProvider } from "./email";

describe("email", () => {
  describe("upsertEmailProvider", () => {
    it("should be able to update an existing email provider", async () => {
      const workspace = await createWorkspace({
        name: randomUUID(),
      }).then(unwrap);

      await upsertEmailProvider({
        workspaceId: workspace.id,
        setDefault: true,
        config: {
          type: EmailProviderType.SendGrid,
          apiKey: "123",
        },
      });

      await upsertEmailProvider({
        workspaceId: workspace.id,
        setDefault: true,
        config: {
          type: EmailProviderType.SendGrid,
          apiKey: "456",
        },
      });

      const provider = await db().query.defaultEmailProvider.findFirst({
        where: (table, { eq }) => eq(table.workspaceId, workspace.id),
        with: {
          emailProvider: {
            with: {
              secret: true,
            },
          },
        },
      });

      expect(provider?.emailProvider.secret?.configValue).toEqual(
        expect.objectContaining({
          apiKey: "456",
        }),
      );
    });
  });
});
