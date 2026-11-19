import { and, desc, eq, inArray } from "drizzle-orm";
import { err, ok, Result } from "neverthrow";

import config from "./config";
import { db } from "./db";
import { messageTemplateSnippet as dbSnippet } from "./db/schema";
import logger from "./logger";
import { SnippetResource, UpsertSnippetResource } from "./types";

/**
 * Snippets are the reusable Liquid fragments of the content module: a named
 * body that any template pulls in with `{% snippet "name" %}`. They are the
 * Dittofeed counterpart of Iterable snippets and Braze content blocks, and
 * exist so that shared markup (a header, a footer, a product card) is written
 * once instead of being inlined into every template.
 */
const SNIPPET_REFERENCE_PATTERN = /\{%-?\s*snippet\s+("[^"]+"|'[^']+')/g;

export function extractSnippetNamesFromTemplate(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(SNIPPET_REFERENCE_PATTERN)) {
    const raw = match[1];
    if (!raw) {
      continue;
    }
    const name = raw.slice(1, -1);
    if (name.length) {
      names.push(name);
    }
  }
  return names;
}

export function extractSnippetNamesFromTemplates(
  templates: Record<string, string | undefined>,
): string[] {
  const names = new Set<string>();
  for (const template of Object.values(templates)) {
    if (typeof template !== "string") {
      continue;
    }
    for (const name of extractSnippetNamesFromTemplate(template)) {
      names.add(name);
    }
  }
  return [...names];
}

export type SnippetUpsertErrorType = "UniqueNameViolation" | "InvalidId";

export interface SnippetUpsertError {
  type: SnippetUpsertErrorType;
  message: string;
}

type SnippetRow = typeof dbSnippet.$inferSelect;

export function toSnippetResource(row: SnippetRow): SnippetResource {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    body: row.body,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export async function listSnippets({
  workspaceId,
  ids,
}: {
  workspaceId: string;
  ids?: string[];
}): Promise<SnippetResource[]> {
  const conditions = [eq(dbSnippet.workspaceId, workspaceId)];
  if (ids) {
    conditions.push(inArray(dbSnippet.id, ids));
  }
  const rows = await db().query.messageTemplateSnippet.findMany({
    where: and(...conditions),
    orderBy: [desc(dbSnippet.updatedAt)],
  });
  return rows.map(toSnippetResource);
}

export async function getSnippetByName({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}): Promise<SnippetResource | null> {
  const row = await db().query.messageTemplateSnippet.findFirst({
    where: and(
      eq(dbSnippet.workspaceId, workspaceId),
      eq(dbSnippet.name, name),
    ),
  });
  return row ? toSnippetResource(row) : null;
}

/**
 * Creates or replaces a snippet. A snippet is addressed by name, so the unique
 * key is `(workspaceId, name)`; updating an existing name keeps its id so that
 * a send that resolved the snippet a moment ago keeps pointing at the same
 * resource.
 */
export async function upsertSnippet(
  resource: UpsertSnippetResource,
): Promise<Result<SnippetResource, SnippetUpsertError>> {
  const { workspaceId, id, name, description, body } = resource;

  const conflicting = await db().query.messageTemplateSnippet.findFirst({
    where: and(
      eq(dbSnippet.workspaceId, workspaceId),
      eq(dbSnippet.name, name),
    ),
  });
  // Writing a name that already exists without naming an id is an upsert: the
  // name is the identity of a snippet, so the caller does not have to look the
  // id up first. Naming a different id is a rename onto a taken name, which is
  // rejected rather than silently merging two snippets.
  if (conflicting && id && conflicting.id !== id) {
    return err({
      type: "UniqueNameViolation",
      message: `A snippet named "${name}" already exists in this workspace`,
    });
  }

  if (id) {
    const existingById = await db().query.messageTemplateSnippet.findFirst({
      where: and(eq(dbSnippet.id, id), eq(dbSnippet.workspaceId, workspaceId)),
    });
    if (!existingById) {
      return err({
        type: "InvalidId",
        message: `Snippet ${id} does not exist in this workspace`,
      });
    }
  }

  const now = new Date();
  const values = {
    workspaceId,
    name,
    description: description ?? null,
    body,
    updatedAt: now,
  };

  const [row] = id
    ? await db()
        .update(dbSnippet)
        .set(values)
        .where(
          and(eq(dbSnippet.id, id), eq(dbSnippet.workspaceId, workspaceId)),
        )
        .returning()
    : await db()
        .insert(dbSnippet)
        .values(values)
        .onConflictDoUpdate({
          target: [dbSnippet.workspaceId, dbSnippet.name],
          // Drizzle does not fire `$onUpdate` on the conflict branch, so the
          // timestamp is set explicitly.
          set: { description: values.description, body, updatedAt: now },
        })
        .returning();

  if (!row) {
    return err({
      type: "InvalidId",
      message: `Snippet ${id ?? name} could not be written`,
    });
  }
  return ok(toSnippetResource(row));
}

export async function deleteSnippet({
  workspaceId,
  id,
}: {
  workspaceId: string;
  id: string;
}): Promise<boolean> {
  const deleted = await db()
    .delete(dbSnippet)
    .where(and(eq(dbSnippet.id, id), eq(dbSnippet.workspaceId, workspaceId)))
    .returning({ id: dbSnippet.id });
  return deleted.length > 0;
}

/**
 * Loads every snippet a set of templates reaches, transitively: a snippet may
 * itself reference other snippets, and the renderer needs the whole closure in
 * one scope. Names that do not exist are logged and skipped, matching the way
 * a missing catalog collection renders as empty rather than failing a send.
 */
/**
 * Walks one generation of snippet references and recurses into the references
 * the loaded snippets add. A snippet that includes another snippet therefore
 * resolves to the whole closure in one pass, and a cycle stops at the depth
 * bound instead of looping.
 */
async function loadSnippetClosure({
  workspaceId,
  names,
  round,
}: {
  workspaceId: string;
  names: string[];
  round: number;
}): Promise<Record<string, string>> {
  const unique = [...new Set(names)];
  if (unique.length === 0) {
    return {};
  }
  if (round >= 20) {
    logger().warn(
      { workspaceId, pending: unique },
      "Snippet reference closure did not settle; rendering the snippets loaded so far",
    );
    return {};
  }

  const rows = await db().query.messageTemplateSnippet.findMany({
    where: and(
      eq(dbSnippet.workspaceId, workspaceId),
      inArray(dbSnippet.name, unique),
    ),
  });
  const byName = new Map(rows.map((row) => [row.name, row]));

  const bodies: Record<string, string> = {};
  const next = new Set<string>();
  for (const name of unique) {
    const row = byName.get(name);
    if (!row) {
      logger().warn(
        { workspaceId, snippetName: name },
        "Snippet referenced by a template was not found; rendering it as empty",
      );
      continue;
    }
    bodies[name] = row.body;
    for (const nested of extractSnippetNamesFromTemplate(row.body)) {
      if (bodies[nested] === undefined) {
        next.add(nested);
      }
    }
  }

  const nestedBodies = await loadSnippetClosure({
    workspaceId,
    names: [...next],
    round: round + 1,
  });
  // The generation closer to the template wins when a name appears twice.
  return { ...nestedBodies, ...bodies };
}

/**
 * Loads every snippet a set of templates reaches, transitively: a snippet may
 * itself reference other snippets, and the renderer needs the whole closure in
 * one scope. Names that do not exist are logged and skipped, matching the way
 * a missing catalog collection renders as empty rather than failing a send.
 */
export async function loadSnippetsForTemplates({
  workspaceId,
  templates,
}: {
  workspaceId: string;
  templates: Record<string, string | undefined>;
}): Promise<Record<string, string>> {
  return loadSnippetClosure({
    workspaceId,
    names: extractSnippetNamesFromTemplates(templates),
    round: 0,
  });
}

export function snippetMaxDepth(): number {
  return config().snippetMaxDepth;
}
