import { randomUUID } from "crypto";
import { MOBILE_PUSH_PROVIDER_TYPE_TO_SECRET_NAME } from "isomorphic-lib/src/constants";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  ChannelType,
  InternalEventType,
  MessageSkippedType,
  MobilePushProviderType,
  MobilePushTemplateResource,
} from "isomorphic-lib/src/types";

import { db, insert } from "../db";
import {
  messageTemplate as dbMessageTemplate,
  mobilePushProvider as dbMobilePushProvider,
  secret as dbSecret,
} from "../db/schema";
import { sendMobilePush } from "../messaging";
import { createWorkspace } from "../workspaces";
import {
  getOrCreateMobilePushProviders,
  upsertMobilePushProvider,
} from "./mobilePush";

describe("mobilePush", () => {
  describe("upsertMobilePushProvider", () => {
    it("should create a provider, secret, and set it as default", async () => {
      const workspace = unwrap(
        await createWorkspace({
          name: randomUUID(),
        }),
      );
      const provider = await upsertMobilePushProvider({
        workspaceId: workspace.id,
        setDefault: true,
        config: {
          type: MobilePushProviderType.Test,
        },
      });

      expect(provider.type).toBe(MobilePushProviderType.Test);

      const defaultProvider =
        await db().query.defaultMobilePushProvider.findFirst({
          where: (table, { eq }) => eq(table.workspaceId, workspace.id),
          with: {
            mobilePushProvider: {
              with: {
                secret: true,
              },
            },
          },
        });
      expect(defaultProvider?.mobilePushProvider.id).toBe(provider.id);
      expect(defaultProvider?.mobilePushProvider.secret.configValue).toEqual(
        expect.objectContaining({
          type: MobilePushProviderType.Test,
        }),
      );
    });
  });

  describe("getOrCreateMobilePushProviders", () => {
    it("should return an existing provider without duplicating it", async () => {
      const workspace = unwrap(
        await createWorkspace({
          name: randomUUID(),
        }),
      );
      const provider = await upsertMobilePushProvider({
        workspaceId: workspace.id,
        setDefault: true,
        config: {
          type: MobilePushProviderType.Test,
        },
      });

      const providers = await getOrCreateMobilePushProviders({
        workspaceId: workspace.id,
      });

      expect(providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: provider.id,
            type: MobilePushProviderType.Test,
          }),
        ]),
      );
    });

    it("should create a test provider when none exist", async () => {
      const workspace = unwrap(
        await createWorkspace({
          name: randomUUID(),
        }),
      );

      const providers = await getOrCreateMobilePushProviders({
        workspaceId: workspace.id,
      });

      expect(providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: MobilePushProviderType.Test,
          }),
        ]),
      );
    });
    it("should upsert an existing provider without creating a duplicate", async () => {
      const workspace = unwrap(
        await createWorkspace({
          name: randomUUID(),
        }),
      );
      const first = await upsertMobilePushProvider({
        workspaceId: workspace.id,
        config: {
          type: MobilePushProviderType.Test,
        },
      });
      const second = await upsertMobilePushProvider({
        workspaceId: workspace.id,
        setDefault: true,
        config: {
          type: MobilePushProviderType.Test,
        },
      });

      expect(second.id).toBe(first.id);

      const providers = await db().query.mobilePushProvider.findMany({
        where: (table, { eq }) => eq(table.workspaceId, workspace.id),
      });
      expect(providers).toHaveLength(1);
    });

    it("should keep configured providers and skip unknown provider types", async () => {
      const workspace = unwrap(
        await createWorkspace({
          name: randomUUID(),
        }),
      );
      const firebaseSecret = unwrap(
        await insert({
          table: dbSecret,
          values: {
            workspaceId: workspace.id,
            name: MOBILE_PUSH_PROVIDER_TYPE_TO_SECRET_NAME[
              MobilePushProviderType.Firebase
            ],
            configValue: {
              project_id: "project",
              client_email: "client@example.com",
              private_key: "key",
            },
          },
        }),
      );
      const firebaseProvider = unwrap(
        await insert({
          table: dbMobilePushProvider,
          values: {
            workspaceId: workspace.id,
            type: MobilePushProviderType.Firebase,
            secretId: firebaseSecret.id,
          },
        }),
      );
      const unknownSecret = unwrap(
        await insert({
          table: dbSecret,
          values: {
            workspaceId: workspace.id,
            name: `unknown-mobile-push-secret-${randomUUID()}`,
            configValue: { type: "Unknown" },
          },
        }),
      );
      await insert({
        table: dbMobilePushProvider,
        values: {
          workspaceId: workspace.id,
          type: "Unknown",
          secretId: unknownSecret.id,
        },
      });

      const providers = await getOrCreateMobilePushProviders({
        workspaceId: workspace.id,
      });

      expect(providers.map((p) => p.type).sort()).toEqual(
        [MobilePushProviderType.Firebase, MobilePushProviderType.Test].sort(),
      );
      expect(providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: firebaseProvider.id,
            type: MobilePushProviderType.Firebase,
          }),
        ]),
      );
    });
  });

  describe("sendMobilePush", () => {
    it("should send a message using the default provider", async () => {
      const workspace = unwrap(
        await createWorkspace({
          name: randomUUID(),
        }),
      );
      await upsertMobilePushProvider({
        workspaceId: workspace.id,
        setDefault: true,
        config: {
          type: MobilePushProviderType.Test,
        },
      });
      const template = unwrap(
        await insert({
          table: dbMessageTemplate,
          values: {
            id: randomUUID(),
            workspaceId: workspace.id,
            name: `template-${randomUUID()}`,
            updatedAt: new Date(),
            createdAt: new Date(),
            definition: {
              type: ChannelType.MobilePush,
              title: "Hello",
              body: "World",
            } satisfies MobilePushTemplateResource,
          },
        }),
      );

      const userId = "1234";
      const deviceToken = "device-token-1";
      const result = await sendMobilePush({
        workspaceId: workspace.id,
        templateId: template.id,
        userId,
        useDraft: false,
        userPropertyAssignments: {
          id: userId,
          deviceToken,
        },
      });

      const unwrapped = unwrap(result);
      expect(unwrapped).toMatchObject({
        type: InternalEventType.MessageSent,
        variant: {
          type: ChannelType.MobilePush,
          to: deviceToken,
          title: "Hello",
          body: "World",
          provider: {
            type: MobilePushProviderType.Test,
          },
        },
      });
    });

    it("should skip the message when the device token is missing", async () => {
      const workspace = unwrap(
        await createWorkspace({
          name: randomUUID(),
        }),
      );
      await upsertMobilePushProvider({
        workspaceId: workspace.id,
        setDefault: true,
        config: {
          type: MobilePushProviderType.Test,
        },
      });
      const template = unwrap(
        await insert({
          table: dbMessageTemplate,
          values: {
            id: randomUUID(),
            workspaceId: workspace.id,
            name: `template-${randomUUID()}`,
            updatedAt: new Date(),
            createdAt: new Date(),
            definition: {
              type: ChannelType.MobilePush,
              title: "Hello",
              body: "World",
            } satisfies MobilePushTemplateResource,
          },
        }),
      );

      const result = await sendMobilePush({
        workspaceId: workspace.id,
        templateId: template.id,
        userId: "1234",
        useDraft: false,
        userPropertyAssignments: {
          id: "1234",
        },
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toEqual({
          type: InternalEventType.MessageSkipped,
          variant: {
            type: MessageSkippedType.MissingIdentifier,
            identifierKey: "deviceToken",
          },
        });
      }
    });
  });
});
