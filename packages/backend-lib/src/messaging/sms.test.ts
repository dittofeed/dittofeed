import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { SmsProviderType } from "isomorphic-lib/src/types";

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
    });
  });
});
