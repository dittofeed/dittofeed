import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { writeKeyToHeader } from "isomorphic-lib/src/auth";
import { toBase64 } from "isomorphic-lib/src/encode";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { getOrCreateWriteKey, validateWriteKey } from "./auth";
import { db } from "./db";
import { secret as dbSecret } from "./db/schema";
import { Workspace } from "./types";
import { createWorkspace } from "./workspaces";

describe("validateWriteKey", () => {
  let workspace: Workspace;
  let result: Awaited<ReturnType<typeof validateWriteKey>> | undefined;
  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: randomUUID(),
        updatedAt: new Date(),
      }),
    );
  });

  describe("when write key is valid", () => {
    beforeEach(async () => {
      const writeKey = await getOrCreateWriteKey({
        workspaceId: workspace.id,
        writeKeyName: "test",
      });
      const header = writeKeyToHeader(writeKey);
      result = await validateWriteKey({ writeKey: header });
    });
    it("should return ok", () => {
      expect(result?.isOk()).toBe(true);
    });
  });
  describe("when write key is missing", () => {
    beforeEach(async () => {
      result = await validateWriteKey({
        writeKey: `Basic ${toBase64("missing:")}`,
      });
    });
    it("should return InvalidWriteKey", () => {
      expect(result?.isErr()).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result!._unsafeUnwrapErr()).toBe("InvalidWriteKey");
    });
  });
  describe("when write key is malformed", () => {
    beforeEach(async () => {
      result = await validateWriteKey({
        writeKey: "Basic foobar",
      });
    });
    it("should return InvalidWriteKey", () => {
      expect(result?.isErr()).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result!._unsafeUnwrapErr()).toBe("InvalidWriteKey");
    });
  });

  describe("when write key has the wrong value", () => {
    beforeEach(async () => {
      await getOrCreateWriteKey({
        workspaceId: workspace.id,
        writeKeyName: "test",
      });
      const secret = await db().query.secret.findFirst({
        where: and(
          eq(dbSecret.workspaceId, workspace.id),
          eq(dbSecret.name, "test"),
        ),
      });
      const secretID = `${secret?.id ?? ""}:wrong`;
      result = await validateWriteKey({
        writeKey: `Basic ${toBase64(secretID)}`,
      });
    });
    it("should return InvalidWriteKey", () => {
      expect(result?.isErr()).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result!._unsafeUnwrapErr()).toBe("InvalidWriteKey");
    });
  });
});
