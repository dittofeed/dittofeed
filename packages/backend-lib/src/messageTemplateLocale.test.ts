import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ChannelType, EmailContentsType } from "isomorphic-lib/src/types";

import { db, insert } from "./db";
import {
  messageTemplate as dbMessageTemplate,
  workspace as dbWorkspace,
} from "./db/schema";
import {
  BASELINE_LOCALE,
  localeFallbackChain,
  messageTemplateLocaleCandidates,
  normalizeLocale,
} from "./messageTemplateLocale";
import { findMessageTemplate, upsertMessageTemplate } from "./messaging";
import { Workspace } from "./types";

function emailDefinition(body: string) {
  return {
    type: ChannelType.Email,
    subject: "Hello",
    from: "hello@example.com",
    replyTo: "",
    emailContentsType: EmailContentsType.Code,
    body,
  };
}

describe("message template locale", () => {
  describe("normalizeLocale", () => {
    it("lower cases a tag", () => {
      expect(normalizeLocale("ZH-Hant")).toEqual("zh-hant");
    });

    it("treats underscores as subtag separators", () => {
      expect(normalizeLocale("zh_Hant_HK")).toEqual("zh-hant-hk");
    });

    it("trims surrounding whitespace", () => {
      expect(normalizeLocale(" en-US ")).toEqual("en-us");
    });

    it("returns undefined for nothing", () => {
      expect(normalizeLocale(undefined)).toBeUndefined();
      expect(normalizeLocale(null)).toBeUndefined();
      expect(normalizeLocale("")).toBeUndefined();
      expect(normalizeLocale("   ")).toBeUndefined();
    });

    it("returns undefined for a value that is not a locale tag", () => {
      expect(normalizeLocale("en US")).toBeUndefined();
      expect(normalizeLocale("e")).toBeUndefined();
      expect(normalizeLocale("en-")).toBeUndefined();
    });
  });

  describe("localeFallbackChain", () => {
    it("tries the locale and every prefix before the default", () => {
      expect(localeFallbackChain("zh-hant-hk", "en")).toEqual([
        "zh-hant-hk",
        "zh-hant",
        "zh",
        "en",
        BASELINE_LOCALE,
      ]);
    });

    it("collapses a locale that is also the default", () => {
      expect(localeFallbackChain("en-us", "en")).toEqual([
        "en-us",
        "en",
        BASELINE_LOCALE,
      ]);
    });

    it("falls back to the default when the recipient has no locale", () => {
      expect(localeFallbackChain(undefined, "en-gb")).toEqual([
        "en-gb",
        "en",
        BASELINE_LOCALE,
      ]);
    });

    it("still ends at the baseline when nothing is known", () => {
      expect(localeFallbackChain(undefined, undefined)).toEqual([
        BASELINE_LOCALE,
      ]);
    });
  });

  describe("resolution", () => {
    let workspace: Workspace;

    beforeEach(async () => {
      workspace = unwrap(
        await insert({
          table: dbWorkspace,
          values: {
            id: randomUUID(),
            name: `workspace-${randomUUID()}`,
            updatedAt: new Date(),
          },
        }),
      );
    });

    async function createVersion({
      name,
      locale,
      body,
    }: {
      name: string;
      locale?: string;
      body: string;
    }) {
      return unwrap(
        await upsertMessageTemplate({
          workspaceId: workspace.id,
          name,
          locale,
          definition: emailDefinition(body),
        }),
      );
    }

    it("stores each locale as its own row and keeps the baseline", async () => {
      const baseline = await createVersion({ name: "welcome", body: "Hello" });
      const mandarin = await createVersion({
        name: "welcome",
        locale: "zh",
        body: "你好",
      });

      expect(baseline.locale).toBeUndefined();
      expect(mandarin.locale).toEqual("zh");
      expect(mandarin.id).not.toEqual(baseline.id);
    });

    it("serves a regional recipient from its language prefix", async () => {
      const baseline = await createVersion({ name: "welcome", body: "Hello" });
      await createVersion({ name: "welcome", locale: "zh", body: "你好" });

      const resolved = unwrap(
        await findMessageTemplate({
          id: baseline.id,
          workspaceId: workspace.id,
          channel: ChannelType.Email,
          locale: "zh-hans-cn",
        }),
      );
      expect(resolved?.locale).toEqual("zh");
    });

    it("prefers the most specific locale that exists", async () => {
      const baseline = await createVersion({ name: "welcome", body: "Hello" });
      await createVersion({ name: "welcome", locale: "zh", body: "你好" });
      await createVersion({
        name: "welcome",
        locale: "zh-hant",
        body: "妳好",
      });

      const resolved = unwrap(
        await findMessageTemplate({
          id: baseline.id,
          workspaceId: workspace.id,
          channel: ChannelType.Email,
          locale: "zh-hant-hk",
        }),
      );
      expect(resolved?.definition).toMatchObject({ body: "妳好" });
    });

    it("falls back to the baseline for a locale with no translation", async () => {
      const baseline = await createVersion({ name: "welcome", body: "Hello" });
      await createVersion({ name: "welcome", locale: "zh", body: "你好" });

      const resolved = unwrap(
        await findMessageTemplate({
          id: baseline.id,
          workspaceId: workspace.id,
          channel: ChannelType.Email,
          locale: "fr",
        }),
      );
      expect(resolved?.id).toEqual(baseline.id);
    });

    it("uses the baseline when the recipient has no locale", async () => {
      const baseline = await createVersion({ name: "welcome", body: "Hello" });
      await createVersion({ name: "welcome", locale: "zh", body: "你好" });

      const resolved = unwrap(
        await findMessageTemplate({
          id: baseline.id,
          workspaceId: workspace.id,
          channel: ChannelType.Email,
        }),
      );
      expect(resolved?.id).toEqual(baseline.id);
    });

    it("resolves a translation even when the send starts from its id", async () => {
      await createVersion({ name: "welcome", body: "Hello" });
      const mandarin = await createVersion({
        name: "welcome",
        locale: "zh",
        body: "你好",
      });

      const resolved = unwrap(
        await findMessageTemplate({
          id: mandarin.id,
          workspaceId: workspace.id,
          channel: ChannelType.Email,
          locale: "zh-hant",
        }),
      );
      expect(resolved?.locale).toEqual("zh");
    });

    it("keeps a template's locale when an update by id omits it", async () => {
      const mandarin = await createVersion({
        name: "welcome",
        locale: "zh",
        body: "你好",
      });
      const updated = unwrap(
        await upsertMessageTemplate({
          workspaceId: workspace.id,
          id: mandarin.id,
          name: "welcome",
          definition: emailDefinition("你好，世界"),
        }),
      );
      expect(updated.id).toEqual(mandarin.id);
      expect(updated.locale).toEqual("zh");
    });

    it("updates a translation in place when name and locale match", async () => {
      const first = await createVersion({
        name: "welcome",
        locale: "zh",
        body: "你好",
      });
      const second = await createVersion({
        name: "welcome",
        locale: "zh",
        body: "你好，世界",
      });
      expect(second.id).toEqual(first.id);
      expect(second.locale).toEqual("zh");
    });

    it("rejects a locale that is not a tag", async () => {
      const result = await upsertMessageTemplate({
        workspaceId: workspace.id,
        name: "welcome",
        locale: "en US",
        definition: emailDefinition("Hello"),
      });
      expect(result.isErr() ? result.error.type : null).toEqual(
        "InvalidLocale",
      );
    });

    it("orders the candidates so the starting row is never dropped", async () => {
      const baseline = await createVersion({ name: "welcome", body: "Hello" });
      await createVersion({
        name: "welcome",
        locale: "ja",
        body: "こんにちは",
      });

      const baselineRow = await db().query.messageTemplate.findFirst({
        where: eq(dbMessageTemplate.id, baseline.id),
      });
      if (!baselineRow) {
        throw new Error("baseline template row missing");
      }
      const candidates = await messageTemplateLocaleCandidates({
        workspaceId: workspace.id,
        template: baselineRow,
        locale: "de",
      });
      expect(candidates.map((candidate) => candidate.locale)).toEqual([""]);
    });
  });
});
