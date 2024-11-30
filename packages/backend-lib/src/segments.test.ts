import { UserProperty, Workspace } from "@prisma/client";
import { randomUUID } from "crypto";

import prisma from "./prisma";
import { buildSegmentsFile } from "./segments";
import {
  IdUserPropertyDefinition,
  TraitUserPropertyDefinition,
  UserPropertyDefinitionType,
} from "./types";

describe("segments", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = await prisma().workspace.create({
      data: {
        name: `test-${randomUUID()}`,
      },
    });
  });
  describe("buildSegmentsFile", () => {
    let userIdProperty: UserProperty;
    let emailProperty: UserProperty;
    let phoneProperty: UserProperty;

    beforeEach(async () => {
      [userIdProperty, emailProperty, phoneProperty] = await Promise.all([
        prisma().userProperty.create({
          data: {
            name: "id",
            workspaceId: workspace.id,
            definition: {
              type: UserPropertyDefinitionType.Id,
            } satisfies IdUserPropertyDefinition,
          },
        }),
        prisma().userProperty.create({
          data: {
            name: "email",
            workspaceId: workspace.id,
            definition: {
              type: UserPropertyDefinitionType.Trait,
              path: "email",
            } satisfies TraitUserPropertyDefinition,
          },
        }),
        prisma().userProperty.create({
          data: {
            name: "phone",
            workspaceId: workspace.id,
            definition: {
              type: UserPropertyDefinitionType.Trait,
              path: "phone",
            } satisfies TraitUserPropertyDefinition,
          },
        }),
      ]);
    });

    describe("when the identifiers contain valid values", () => {
      beforeEach(async () => {
        await Promise.all([
          prisma().userPropertyAssignment.create({
            data: {
              userId: randomUUID(),
              userPropertyId: userIdProperty.id,
              value: "123",
              workspaceId: workspace.id,
            },
          }),
          prisma().userPropertyAssignment.create({
            data: {
              userId: randomUUID(),
              userPropertyId: emailProperty.id,
              value: "test@test.com",
              workspaceId: workspace.id,
            },
          }),
          prisma().userPropertyAssignment.create({
            data: {
              userId: randomUUID(),
              userPropertyId: phoneProperty.id,
              value: "1234567890",
              workspaceId: workspace.id,
            },
          }),
        ]);
      });
      it("generates a file name with its contents", async () => {
        const { fileName, fileContent } = await buildSegmentsFile({
          workspaceId: workspace.id,
        });
        expect(fileName).toBeDefined();
        expect(fileContent).toBeDefined();
      });
    });
  });
});
