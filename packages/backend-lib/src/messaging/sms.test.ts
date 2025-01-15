import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { SmsProviderType } from "isomorphic-lib/src/types";

import { db } from "../db";
import { createWorkspace } from "../workspaces";
import { upsertSmsProvider } from "./sms";

describe("sms", () => {
  describe("upsertSmsProvider", () => {
    it("should be able to update an existing sms provider", async () => {
      const workspace = unwrap(
        await createWorkspace({
          name: randomUUID(),
        }),
      );
      await upsertSmsProvider({
        workspaceId: workspace.id,
        setDefault: true,
        config: {
          type: SmsProviderType.Twilio,
          accountSid: "123",
          authToken: "456",
        },
      });
      await upsertSmsProvider({
        workspaceId: workspace.id,
        setDefault: true,
        config: {
          type: SmsProviderType.Twilio,
          accountSid: "123",
          authToken: "789",
        },
      });

      const provider = await db().query.defaultSmsProvider.findFirst({
        where: (table, { eq }) => eq(table.workspaceId, workspace.id),
        with: {
          smsProvider: {
            with: {
              secret: true,
            },
          },
        },
      });
      expect(provider?.smsProvider.secret.configValue).toEqual(
        expect.objectContaining({
          accountSid: "123",
          authToken: "789",
        }),
      );
    });
  });
});
