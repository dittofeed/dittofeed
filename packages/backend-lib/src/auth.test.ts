import { Workspace } from "@prisma/client";
import { randomUUID } from "crypto";

import { createWriteKey, validateWriteKey } from "./auth";
import { toBase64 } from "./encode";
import prisma from "./prisma";

describe("validateWriteKey", () => {
  let workspace: Workspace;
  let valid: boolean;

  describe("when write key is valid", () => {
    beforeEach(async () => {
      workspace = await prisma().workspace.create({
        data: {
          name: randomUUID(),
        },
      });
      const writeKey = await createWriteKey({
        workspaceId: workspace.id,
        writeKeyName: "test",
        writeKeyValue: "test",
      });
      valid = await validateWriteKey({ writeKey: `Basic ${writeKey}` });
    });
    it("should return true", async () => {
      expect(valid).toBe(true);
    });
  });
  describe("when write key is missing", () => {
    beforeEach(async () => {
      valid = await validateWriteKey({
        writeKey: `Basic ${toBase64("missing:")}`,
      });
    });
    it("should return false", async () => {
      expect(valid).toBe(false);
    });
  });
  describe("when write key is malformed", () => {
    beforeEach(async () => {
      valid = await validateWriteKey({
        writeKey: "Basic foobar",
      });
    });
    it("should return false", async () => {
      expect(valid).toBe(false);
    });
  });

  describe("when write key has the wrong value", () => {
    beforeEach(async () => {
      workspace = await prisma().workspace.create({
        data: {
          name: randomUUID(),
        },
      });
      await createWriteKey({
        workspaceId: workspace.id,
        writeKeyName: "test",
        writeKeyValue: "test",
      });
      const secret = await prisma().secret.findUnique({
        where: {
          workspaceId_name: {
            workspaceId: workspace.id,
            name: "test",
          },
        },
      });

      valid = await validateWriteKey({
        writeKey: `Basic ${toBase64(`${secret?.id}:wrong`)}`,
      });
    });
    it("should return false", async () => {
      expect(valid).toBe(false);
    });
  });
});
