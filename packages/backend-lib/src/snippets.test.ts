import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { insert } from "./db";
import { workspace as dbWorkspace } from "./db/schema";
import {
  deleteSnippet,
  extractSnippetNamesFromTemplate,
  extractSnippetNamesFromTemplates,
  getSnippetByName,
  listSnippets,
  loadSnippetsForTemplates,
  upsertSnippet,
} from "./snippets";
import { Workspace } from "./types";

describe("snippets", () => {
  describe("extractSnippetNamesFromTemplate", () => {
    it("reads a double quoted name", () => {
      expect(extractSnippetNamesFromTemplate(`{% snippet "header" %}`)).toEqual(
        ["header"],
      );
    });

    it("reads a single quoted name", () => {
      expect(extractSnippetNamesFromTemplate(`{% snippet 'footer' %}`)).toEqual(
        ["footer"],
      );
    });

    it("reads the whitespace trimming form", () => {
      expect(
        extractSnippetNamesFromTemplate(`{%- snippet "header" -%}`),
      ).toEqual(["header"]);
    });

    it("reads a tag that carries keyword arguments", () => {
      expect(
        extractSnippetNamesFromTemplate(
          `{% snippet "product-card", title: item.title, url: item.url %}`,
        ),
      ).toEqual(["product-card"]);
    });

    it("reads every tag of a template, in order and with duplicates", () => {
      expect(
        extractSnippetNamesFromTemplate(
          `{% snippet "header" %}{% snippet "header" %}{% snippet "footer" %}`,
        ),
      ).toEqual(["header", "header", "footer"]);
    });

    it("ignores an unquoted name, which is not a valid tag", () => {
      expect(extractSnippetNamesFromTemplate(`{% snippet header %}`)).toEqual(
        [],
      );
    });

    it("ignores a template without snippet tags", () => {
      expect(
        extractSnippetNamesFromTemplate(
          `{% catalog_collection "shoes" as s %}`,
        ),
      ).toEqual([]);
    });
  });

  describe("extractSnippetNamesFromTemplates", () => {
    it("dedupes names across templates and skips undefined entries", () => {
      expect(
        extractSnippetNamesFromTemplates({
          body: `{% snippet "header" %}`,
          subject: `{% snippet "header" %}{% snippet "footer" %}`,
          preview: undefined,
        }),
      ).toEqual(["header", "footer"]);
    });
  });

  describe("storage", () => {
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

    it("creates a snippet and reads it back by name", async () => {
      const created = unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "header",
          description: "Site header",
          body: `<h1>{{ user.name }}</h1>`,
        }),
      );
      expect(created.name).toEqual("header");
      expect(created.description).toEqual("Site header");
      expect(typeof created.createdAt).toEqual("number");

      const read = await getSnippetByName({
        workspaceId: workspace.id,
        name: "header",
      });
      expect(read?.id).toEqual(created.id);
      expect(read?.body).toEqual(`<h1>{{ user.name }}</h1>`);
    });

    it("returns null when the name is unknown", async () => {
      expect(
        await getSnippetByName({ workspaceId: workspace.id, name: "missing" }),
      ).toBeNull();
    });

    it("overwrites a snippet written by name and keeps its id", async () => {
      const first = unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "header",
          body: "one",
        }),
      );
      const second = unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "header",
          body: "two",
        }),
      );
      expect(second.id).toEqual(first.id);
      expect(second.body).toEqual("two");

      const all = await listSnippets({ workspaceId: workspace.id });
      expect(all).toHaveLength(1);
    });

    it("rejects renaming one snippet onto another name", async () => {
      const first = unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "header",
          body: "one",
        }),
      );
      unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "footer",
          body: "two",
        }),
      );

      const result = await upsertSnippet({
        workspaceId: workspace.id,
        id: first.id,
        name: "footer",
        body: "three",
      });
      expect(result.isErr()).toBe(true);
      expect(result.isErr() ? result.error.type : null).toEqual(
        "UniqueNameViolation",
      );
    });

    it("rejects an id that does not belong to the workspace", async () => {
      const result = await upsertSnippet({
        workspaceId: workspace.id,
        id: randomUUID(),
        name: "header",
        body: "one",
      });
      expect(result.isErr()).toBe(true);
      expect(result.isErr() ? result.error.type : null).toEqual("InvalidId");
    });

    it("lists only the requested ids", async () => {
      const header = unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "header",
          body: "one",
        }),
      );
      unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "footer",
          body: "two",
        }),
      );

      const listed = await listSnippets({
        workspaceId: workspace.id,
        ids: [header.id],
      });
      expect(listed.map((snippet) => snippet.name)).toEqual(["header"]);
    });

    it("does not see snippets of another workspace", async () => {
      unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "header",
          body: "one",
        }),
      );
      const other = unwrap(
        await insert({
          table: dbWorkspace,
          values: {
            id: randomUUID(),
            name: `workspace-${randomUUID()}`,
            updatedAt: new Date(),
          },
        }),
      );
      expect(await listSnippets({ workspaceId: other.id })).toEqual([]);
      expect(
        await getSnippetByName({ workspaceId: other.id, name: "header" }),
      ).toBeNull();
    });

    it("deletes a snippet and reports a second delete as a miss", async () => {
      const created = unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "header",
          body: "one",
        }),
      );
      expect(
        await deleteSnippet({ workspaceId: workspace.id, id: created.id }),
      ).toBe(true);
      expect(
        await deleteSnippet({ workspaceId: workspace.id, id: created.id }),
      ).toBe(false);
    });

    it("does not delete a snippet of another workspace", async () => {
      const created = unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "header",
          body: "one",
        }),
      );
      const other = unwrap(
        await insert({
          table: dbWorkspace,
          values: {
            id: randomUUID(),
            name: `workspace-${randomUUID()}`,
            updatedAt: new Date(),
          },
        }),
      );
      expect(
        await deleteSnippet({ workspaceId: other.id, id: created.id }),
      ).toBe(false);
      expect(
        await getSnippetByName({ workspaceId: workspace.id, name: "header" }),
      ).not.toBeNull();
    });
  });

  describe("loadSnippetsForTemplates", () => {
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

    it("loads the snippets a template references, keyed by name", async () => {
      unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "header",
          body: "HEADER",
        }),
      );

      const loaded = await loadSnippetsForTemplates({
        workspaceId: workspace.id,
        templates: { body: `{% snippet "header" %}` },
      });
      expect(loaded).toEqual({ header: "HEADER" });
    });

    it("loads snippets that are only referenced from another snippet", async () => {
      unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "card",
          body: `{% snippet "price" %}`,
        }),
      );
      unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "price",
          body: "PRICE",
        }),
      );

      const loaded = await loadSnippetsForTemplates({
        workspaceId: workspace.id,
        templates: { body: `{% snippet "card" %}` },
      });
      expect(loaded).toEqual({ card: `{% snippet "price" %}`, price: "PRICE" });
    });

    it("skips a missing snippet instead of failing the send", async () => {
      unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "header",
          body: "HEADER",
        }),
      );

      const loaded = await loadSnippetsForTemplates({
        workspaceId: workspace.id,
        templates: { body: `{% snippet "header" %}{% snippet "nope" %}` },
      });
      expect(loaded).toEqual({ header: "HEADER" });
    });

    it("does not loop forever on a snippet cycle", async () => {
      unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "a",
          body: `{% snippet "b" %}`,
        }),
      );
      unwrap(
        await upsertSnippet({
          workspaceId: workspace.id,
          name: "b",
          body: `{% snippet "a" %}`,
        }),
      );

      const loaded = await loadSnippetsForTemplates({
        workspaceId: workspace.id,
        templates: { body: `{% snippet "a" %}` },
      });
      expect(Object.keys(loaded).sort()).toEqual(["a", "b"]);
    });

    it("returns an empty map when no template references a snippet", async () => {
      expect(
        await loadSnippetsForTemplates({
          workspaceId: workspace.id,
          templates: { body: "plain", subject: undefined },
        }),
      ).toEqual({});
    });
  });
});
