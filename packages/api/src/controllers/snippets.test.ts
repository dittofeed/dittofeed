import { Static, TSchema } from "@sinclair/typebox";
import { createAdminApiKey } from "backend-lib/src/adminApiKeys";
import {
  WorkspaceStatusDbEnum,
  WorkspaceTypeAppEnum,
} from "backend-lib/src/types";
import { createWorkspace } from "backend-lib/src/workspaces";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  ChannelType,
  GetSnippetsResponse,
  RenderMessageTemplateResponse,
  RenderMessageTemplateType,
  SnippetResource,
} from "isomorphic-lib/src/types";
import { v4 as uuidv4 } from "uuid";

import buildApp from "../buildApp";

function parseBody<S extends TSchema>(body: string, schema: S): Static<S> {
  return unwrap(schemaValidateWithErr(JSON.parse(body), schema));
}

/**
 * End-to-end coverage for reusable content snippets:
 *
 *   GET    /api/content/snippets
 *   PUT    /api/content/snippets
 *   DELETE /api/content/snippets
 *   POST   /api/content/templates/render   (renders `{% snippet %}`)
 *
 * A snippet is addressed by name, so the tests pin the parts a migration
 * depends on: that writing the same name twice updates in place instead of
 * forking the resource, that a rename onto a taken name is rejected rather
 * than silently merged, and that the render endpoint actually resolves a
 * snippet body instead of emitting an empty string.
 */
describe("snippets", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let workspaceId: string;
  let authorization: string;

  const url = "/api/content/snippets";

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
      await createAdminApiKey({ workspaceId, name: "snippets" }),
    );
    authorization = `Bearer ${adminKey.apiKey}`;
  });

  afterAll(async () => {
    await app.close();
  });

  async function upsertSnippet(payload: Record<string, unknown>) {
    const response = await app.inject({
      method: "PUT",
      url,
      headers: { authorization },
      payload: { workspaceId, ...payload },
    });
    return response;
  }

  async function listSnippets(query = "") {
    const response = await app.inject({
      method: "GET",
      url: `${url}?workspaceId=${workspaceId}${query}`,
      headers: { authorization },
    });
    expect(response.statusCode).toBe(200);
    return parseBody(response.body, GetSnippetsResponse).snippets;
  }

  async function deleteSnippet(id: string) {
    return app.inject({
      method: "DELETE",
      url,
      headers: { authorization },
      payload: { workspaceId, id },
    });
  }

  it("creates a snippet and lists it back", async () => {
    const response = await upsertSnippet({
      name: "footer",
      description: "Compliance footer",
      body: "<p>Unsubscribe {% unsubscribe_link %}</p>",
    });
    expect(response.statusCode).toBe(200);
    const created = parseBody(response.body, SnippetResource);
    expect(created).toMatchObject({
      name: "footer",
      description: "Compliance footer",
      workspaceId,
    });

    const listed = await listSnippets();
    expect(listed.map((s) => s.name)).toEqual(["footer"]);
  });

  it("updates in place when the same name is written again", async () => {
    const first = parseBody(
      (await upsertSnippet({ name: "header", body: "v1" })).body,
      SnippetResource,
    );
    const second = parseBody(
      (await upsertSnippet({ name: "header", body: "v2" })).body,
      SnippetResource,
    );
    // The name is the identity of a snippet, so a caller that only knows the
    // name must not end up with two rows.
    expect(second.id).toBe(first.id);
    expect(second.body).toBe("v2");
  });

  it("rejects renaming a snippet onto a taken name", async () => {
    const held = parseBody(
      (await upsertSnippet({ name: "held", body: "held" })).body,
      SnippetResource,
    );

    const response = await upsertSnippet({
      id: held.id,
      name: "footer",
      body: "held",
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("already exists");
  });

  it("filters by id", async () => {
    const one = parseBody(
      (await upsertSnippet({ name: "one", body: "1" })).body,
      SnippetResource,
    );
    await upsertSnippet({ name: "two", body: "2" });

    const listed = await listSnippets(`&ids=${one.id}`);
    expect(listed.map((s) => s.name)).toEqual(["one"]);
  });

  it("deletes a snippet and reports a missing one", async () => {
    const created = parseBody(
      (await upsertSnippet({ name: "doomed", body: "x" })).body,
      SnippetResource,
    );

    expect((await deleteSnippet(created.id)).statusCode).toBe(204);
    expect((await deleteSnippet(created.id)).statusCode).toBe(404);

    const listed = await listSnippets();
    expect(listed.map((s) => s.name)).not.toContain("doomed");
  });

  it("renders a template that pulls in a snippet", async () => {
    await upsertSnippet({
      name: "greeting",
      body: "Hello {{ user.firstName }},",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/content/templates/render",
      headers: { authorization },
      payload: {
        workspaceId,
        channel: ChannelType.Email,
        contents: {
          body: {
            type: RenderMessageTemplateType.PlainText,
            value: '{% snippet "greeting" %} your order shipped.',
          },
        },
        userProperties: { firstName: "Ada", email: "ada@example.com" },
      },
    });
    expect(response.statusCode).toBe(200);
    const { contents } = parseBody(
      response.body,
      RenderMessageTemplateResponse,
    );
    expect(contents.body).toEqual({
      type: "Ok",
      value: "Hello Ada, your order shipped.",
    });
  });

  it("renders a snippet with keyword arguments", async () => {
    await upsertSnippet({
      name: "product-card",
      body: "{{ title }} - {{ price }}",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/content/templates/render",
      headers: { authorization },
      payload: {
        workspaceId,
        channel: ChannelType.Email,
        contents: {
          body: {
            type: RenderMessageTemplateType.PlainText,
            value: '{% snippet "product-card", title: "Mug", price: "9.00" %}',
          },
        },
        userProperties: { email: "ada@example.com" },
      },
    });
    expect(response.statusCode).toBe(200);
    const { contents } = parseBody(
      response.body,
      RenderMessageTemplateResponse,
    );
    expect(contents.body).toEqual({ type: "Ok", value: "Mug - 9.00" });
  });
});
