import { randomUUID } from "crypto";
import { writeKeyToHeader } from "isomorphic-lib/src/auth";
import { toBase64 } from "isomorphic-lib/src/encode";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { getOrCreateWriteKey, validateWriteKey } from "./auth";
import prisma from "./prisma";
import { Workspace } from "./types";
import { createWorkspace } from "./workspaces";

describe("validateWriteKey", () => {
  let workspace: Workspace;
  let valid: string | null;
  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        id: randomUUID(),
        name: randomUUID(),
        updatedAt: new Date().toISOString(),
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
      valid = await validateWriteKey({ writeKey: header });
    });
    it("should return true", () => {
      expect(valid).not.toBe(null);
    });
  });
  describe("when write key is missing", () => {
    beforeEach(async () => {
      valid = await validateWriteKey({
        writeKey: `Basic ${toBase64("missing:")}`,
      });
    });
    it("should return false", () => {
      expect(valid).toBe(null);
    });
  });
  describe("when write key is malformed", () => {
    beforeEach(async () => {
      valid = await validateWriteKey({
        writeKey: "Basic foobar",
      });
    });
    it("should return false", () => {
      expect(valid).toBe(null);
    });
  });

  describe("when write key has the wrong value", () => {
    beforeEach(async () => {
      await getOrCreateWriteKey({
        workspaceId: workspace.id,
        writeKeyName: "test",
      });
      const secret = await prisma().secret.findUnique({
        where: {
          workspaceId_name: {
            workspaceId: workspace.id,
            name: "test",
          },
        },
      });
      const secretID = `${secret?.id ?? ""}:wrong`;
      valid = await validateWriteKey({
        writeKey: `Basic ${toBase64(secretID)}`,
      });
    });
    it("should return false", () => {
      expect(valid).toBe(null);
    });
  });
});
