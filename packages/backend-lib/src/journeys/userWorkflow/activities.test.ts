import { randomUUID } from "crypto";

import { db } from "../../db";
import * as schema from "../../db/schema";

describe("user workflows activity test", () => {
  let workspaceId: string;
  beforeEach(async () => {
    workspaceId = randomUUID();
    await db().insert(schema.workspace).values({
      id: workspaceId,
      name: "test",
    });
  });
  describe("sendMessageFactory", () => {
    describe("with events in context", () => {
      it("should calculate AnyOf Performed user properties", () => {});
    });
  });
});
