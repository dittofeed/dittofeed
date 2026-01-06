import { eq } from "drizzle-orm";
import { err, ok, Result } from "neverthrow";

import { db } from "./db";
import * as schema from "./db/schema";
import { SubscriptionManagementTemplate } from "./types";

export interface UpsertTemplateParams {
  workspaceId: string;
  template: string;
}

export interface DeleteTemplateParams {
  workspaceId: string;
}

export interface GetTemplateParams {
  workspaceId: string;
}

export type UpsertTemplateError = "WorkspaceNotFound";
export type DeleteTemplateError = "TemplateNotFound";

/**
 * Upsert a subscription management template for a workspace.
 * Creates a new template if one doesn't exist, otherwise updates the existing one.
 */
export async function upsertSubscriptionManagementTemplate({
  workspaceId,
  template,
}: UpsertTemplateParams): Promise<
  Result<SubscriptionManagementTemplate, UpsertTemplateError>
> {
  // Check if workspace exists
  const workspace = await db().query.workspace.findFirst({
    where: eq(schema.workspace.id, workspaceId),
  });

  if (!workspace) {
    return err("WorkspaceNotFound");
  }

  // Check if template already exists for this workspace
  const existingTemplate =
    await db().query.subscriptionManagementTemplate.findFirst({
      where: eq(
        schema.subscriptionManagementTemplate.workspaceId,
        workspaceId,
      ),
    });

  if (existingTemplate) {
    // Update existing template
    const updated = await db()
      .update(schema.subscriptionManagementTemplate)
      .set({
        template,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptionManagementTemplate.id, existingTemplate.id))
      .returning();

    if (!updated[0]) {
      throw new Error("Failed to update template");
    }

    return ok(updated[0]);
  }

  // Create new template
  const created = await db()
    .insert(schema.subscriptionManagementTemplate)
    .values({
      workspaceId,
      template,
    })
    .returning();

  if (!created[0]) {
    throw new Error("Failed to create template");
  }

  return ok(created[0]);
}

/**
 * Delete the subscription management template for a workspace.
 */
export async function deleteSubscriptionManagementTemplate({
  workspaceId,
}: DeleteTemplateParams): Promise<Result<void, DeleteTemplateError>> {
  const existingTemplate =
    await db().query.subscriptionManagementTemplate.findFirst({
      where: eq(
        schema.subscriptionManagementTemplate.workspaceId,
        workspaceId,
      ),
    });

  if (!existingTemplate) {
    return err("TemplateNotFound");
  }

  await db()
    .delete(schema.subscriptionManagementTemplate)
    .where(eq(schema.subscriptionManagementTemplate.id, existingTemplate.id));

  return ok(undefined);
}

/**
 * Get the subscription management template for a workspace, if one exists.
 */
export async function getSubscriptionManagementTemplate({
  workspaceId,
}: GetTemplateParams): Promise<SubscriptionManagementTemplate | null> {
  const template = await db().query.subscriptionManagementTemplate.findFirst({
    where: eq(schema.subscriptionManagementTemplate.workspaceId, workspaceId),
  });

  return template ?? null;
}
