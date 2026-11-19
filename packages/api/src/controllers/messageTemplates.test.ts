import { Static, TSchema } from "@sinclair/typebox";
import { createAdminApiKey } from "backend-lib/src/adminApiKeys";
import { createWorkspace } from "backend-lib/src/workspaces";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  ChannelType,
  EmailContentsType,
  GetMessageTemplatesResponse,
  MessageTemplateResource,
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "isomorphic-lib/src/types";
import { v4 as uuidv4 } from "uuid";

import buildApp from "../buildApp";

function parseBody<S extends TSchema>(body: string, schema: S): Static<S> {
  return unwrap(schemaValidateWithErr(JSON.parse(body), schema));
}

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

/**
 * End-to-end coverage for localized message templates:
 *
 *   PUT /api/content/templates        (stores a version under a locale)
 *   GET /api/content/templates        (lists, optionally filtered by locale)
 *
 * A translation shares its name with the baseline and differs only by locale,
 * so the tests pin that writing the same name under a second locale creates a
 * second row instead of replacing the first, and that a malformed tag is
 * refused rather than silently stored as the baseline.
 */
describe("localized message templates", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let workspaceId: string;
  let authorization: string;

  beforeAll(async () => {
    app = await buildApp();
    workspaceId = uuidv4();
    unwrap(
      await createWorkspace({
        id: workspaceId,
        name: `workspace-${workspaceId}`,
        domain: "example.com",
        type: WorkspaceTypeAppEnum.Root,
        status: WorkspaceStatusDbEnum.Active,
        updatedAt: new Date(),
        createdAt: new Date(),
      }),
    );
    const adminKey = unwrap(
      await createAdminApiKey({
        workspaceId,
        name: "message-template-locales",
      }),
    );
    authorization = `Bearer ${adminKey.apiKey}`;
  });

  async function upsertTemplate(payload: Record<string, unknown>) {
    const response = await app.inject({
      method: "PUT",
      url: "/api/content/templates",
      headers: { authorization },
      payload: { workspaceId, ...payload },
    });
    return response;
  }

  async function listTemplates(query = "") {
    const response = await app.inject({
      method: "GET",
      url: `/api/content/templates?workspaceId=${workspaceId}${query}`,
      headers: { authorization },
    });
    expect(response.statusCode).toBe(200);
    return parseBody(response.body, GetMessageTemplatesResponse).templates;
  }

  it("stores a translation beside the baseline instead of replacing it", async () => {
    const baseline = await upsertTemplate({
      name: "locale-welcome",
      definition: emailDefinition("Hello"),
    });
    expect(baseline.statusCode).toBe(200);
    const baselineResource = parseBody(baseline.body, MessageTemplateResource);
    expect(baselineResource.locale).toBeUndefined();

    const translated = await upsertTemplate({
      name: "locale-welcome",
      locale: "zh",
      definition: emailDefinition("你好"),
    });
    expect(translated.statusCode).toBe(200);
    const translatedResource = parseBody(
      translated.body,
      MessageTemplateResource,
    );
    expect(translatedResource.locale).toEqual("zh");
    expect(translatedResource.id).not.toEqual(baselineResource.id);

    const templates = await listTemplates();
    const versions = templates.filter((t) => t.name === "locale-welcome");
    expect(versions).toHaveLength(2);
  });

  it("lower cases the locale it stores", async () => {
    const response = await upsertTemplate({
      name: "locale-casing",
      locale: "ZH-Hant-HK",
      definition: emailDefinition("妳好"),
    });
    expect(response.statusCode).toBe(200);
    expect(parseBody(response.body, MessageTemplateResource).locale).toEqual(
      "zh-hant-hk",
    );
  });

  it("updates the same version when name and locale match", async () => {
    const first = await upsertTemplate({
      name: "locale-update",
      locale: "zh",
      definition: emailDefinition("你好"),
    });
    const second = await upsertTemplate({
      name: "locale-update",
      locale: "zh",
      definition: emailDefinition("你好，世界"),
    });
    expect(second.statusCode).toBe(200);
    const firstResource = parseBody(first.body, MessageTemplateResource);
    const secondResource = parseBody(second.body, MessageTemplateResource);
    expect(secondResource.id).toEqual(firstResource.id);
    expect(secondResource.definition).toMatchObject({ body: "你好，世界" });
  });

  it("filters the listing by locale", async () => {
    const templates = await listTemplates(
      `&locale=${encodeURIComponent("ZH-Hant-HK")}`,
    );
    expect(templates).toHaveLength(1);
    expect(templates[0]?.name).toEqual("locale-casing");
  });

  it("returns nothing for a locale that is not a tag", async () => {
    const templates = await listTemplates(
      `&locale=${encodeURIComponent("en US")}`,
    );
    expect(templates).toEqual([]);
  });

  it("refuses a locale that is not a tag", async () => {
    const response = await upsertTemplate({
      name: "locale-invalid",
      locale: "en US",
      definition: emailDefinition("Hello"),
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      type: "InvalidLocale",
    });
  });
});
