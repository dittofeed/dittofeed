import { randomUUID } from "crypto";

import { db } from "../../db";
import * as schema from "../../db/schema";
import { UserPropertyDefinitionType } from "../../types";
import { upsertUserProperty } from "../../userProperties";

describe("user workflows activity test", () => {
  let workspaceId: string;
  beforeEach(async () => {
    workspaceId = randomUUID();
    await db()
      .insert(schema.workspace)
      .values({
        id: workspaceId,
        name: `user-workflow-activity-test-${workspaceId}`,
      });
    await Promise.all([
      upsertUserProperty(
        {
          workspaceId,
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        },
        {
          skipProtectedCheck: true,
        },
      ),
      upsertUserProperty(
        {
          workspaceId,
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        },
        {
          skipProtectedCheck: true,
        },
      ),
    ]);
  });
  describe("sendMessageFactory", () => {
    describe("with events in context", () => {
      it("should calculate AnyOf Performed user properties", () => {});
    });
  });
});
