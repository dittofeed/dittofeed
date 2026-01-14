import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import {
  deleteSubscriptionManagementTemplate,
  getSubscriptionManagementTemplate,
  upsertSubscriptionManagementTemplate,
} from "../subscriptionManagementTemplateCrud";
import { Workspace } from "../types";
import { createWorkspace } from "../workspaces";

describe("subscriptionManagementTemplateCrud", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: `test-${randomUUID()}`,
        updatedAt: new Date(),
      }),
    );
  });

  describe("getSubscriptionManagementTemplate", () => {
    it("returns null when no template exists", async () => {
      const template = await getSubscriptionManagementTemplate({
        workspaceId: workspace.id,
      });
      expect(template).toBeNull();
    });

    it("returns the template when one exists", async () => {
      const templateContent = "<html>Custom Template</html>";
      await upsertSubscriptionManagementTemplate({
        workspaceId: workspace.id,
        template: templateContent,
      });

      const template = await getSubscriptionManagementTemplate({
        workspaceId: workspace.id,
      });
      expect(template).not.toBeNull();
      expect(template?.template).toBe(templateContent);
      expect(template?.workspaceId).toBe(workspace.id);
    });
  });

  describe("upsertSubscriptionManagementTemplate", () => {
    it("creates a new template when none exists", async () => {
      const templateContent = "<html>New Template</html>";
      const result = await upsertSubscriptionManagementTemplate({
        workspaceId: workspace.id,
        template: templateContent,
      });

      expect(result.isOk()).toBe(true);
      const savedTemplate = unwrap(result);
      expect(savedTemplate.template).toBe(templateContent);
      expect(savedTemplate.workspaceId).toBe(workspace.id);
      expect(savedTemplate.id).toBeDefined();
    });

    it("updates an existing template", async () => {
      const initialContent = "<html>Initial Template</html>";
      const updatedContent = "<html>Updated Template</html>";

      await upsertSubscriptionManagementTemplate({
        workspaceId: workspace.id,
        template: initialContent,
      });

      const result = await upsertSubscriptionManagementTemplate({
        workspaceId: workspace.id,
        template: updatedContent,
      });

      expect(result.isOk()).toBe(true);
      const savedTemplate = unwrap(result);
      expect(savedTemplate.template).toBe(updatedContent);

      // Verify only one template exists
      const fetched = await getSubscriptionManagementTemplate({
        workspaceId: workspace.id,
      });
      expect(fetched?.template).toBe(updatedContent);
    });

    it("returns error for non-existent workspace", async () => {
      const result = await upsertSubscriptionManagementTemplate({
        workspaceId: randomUUID(),
        template: "<html>Test</html>",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("WorkspaceNotFound");
      }
    });
  });

  describe("deleteSubscriptionManagementTemplate", () => {
    it("deletes an existing template", async () => {
      const templateContent = "<html>To Delete</html>";
      await upsertSubscriptionManagementTemplate({
        workspaceId: workspace.id,
        template: templateContent,
      });

      const result = await deleteSubscriptionManagementTemplate({
        workspaceId: workspace.id,
      });

      expect(result.isOk()).toBe(true);

      const fetched = await getSubscriptionManagementTemplate({
        workspaceId: workspace.id,
      });
      expect(fetched).toBeNull();
    });

    it("returns error when no template exists", async () => {
      const result = await deleteSubscriptionManagementTemplate({
        workspaceId: workspace.id,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("TemplateNotFound");
      }
    });
  });
});
