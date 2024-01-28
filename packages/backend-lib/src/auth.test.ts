import { Workspace } from "@prisma/client";
import { randomUUID } from "crypto";
import { writeKeyToHeader } from "isomorphic-lib/src/auth";
import { toBase64 } from "isomorphic-lib/src/encode";

import { createWriteKey, validateWriteKey } from "./auth";
import prisma from "./prisma";

describe("validateWriteKey", () => {
  let workspace: Workspace;
  let valid: string | null;

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
