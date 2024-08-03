import {
  MessageTemplate,
  Segment,
  UserProperty,
  Workspace,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import prisma from "./prisma";
import { transferResources } from "./transferResources";
import {
  ChannelType,
  PerformedSegmentNode,
  PerformedUserPropertyDefinition,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  UserPropertyDefinitionType,
  UserPropertyOperatorType,
  WebhookTemplateResource,
} from "./types";

describe("transferResources", () => {
  describe("when the source workspace has multiple relevant resources", () => {
    let sourceWorkspace: Workspace;
    let destinationWorkspace: Workspace;
    let sourceUserProperty: UserProperty;
    let sourceSegment: Segment;
    let sourceTemplate: MessageTemplate;

    beforeEach(async () => {
      [sourceWorkspace, destinationWorkspace] = await Promise.all([
        prisma().workspace.create({
          data: {
            name: `source-workspace-${randomUUID()}`,
          },
        }),
        prisma().workspace.create({
          data: {
            name: `destination-workspace-${randomUUID()}`,
          },
        }),
      ]);

      sourceTemplate = await prisma().messageTemplate.create({
        data: {
          workspaceId: sourceWorkspace.id,
          name: "webhook",
          definition: {
            type: ChannelType.Webhook,
            identifierKey: "id",
            body: "{}",
          } satisfies WebhookTemplateResource,
        },
      });
      sourceUserProperty = await prisma().userProperty.create({
        data: {
          workspaceId: sourceWorkspace.id,
          name: "performed",
          definition: {
            type: UserPropertyDefinitionType.Performed,
            path: "myProperty",
            event: "myEvent",
            properties: [
              {
                path: "templateId",
                operator: {
                  type: UserPropertyOperatorType.Equals,
                  value: sourceTemplate.id,
                },
              },
              {
                path: "templateId",
                operator: {
                  type: UserPropertyOperatorType.Equals,
                  value: "missing",
                },
              },
            ],
          } satisfies PerformedUserPropertyDefinition,
        },
      });
      sourceSegment = await prisma().segment.create({
        data: {
          workspaceId: sourceWorkspace.id,
          name: "source-segment",
          definition: {
            entryNode: {
              type: SegmentNodeType.Performed,
              id: "1",
              event: "myEvent",
              properties: [
                {
                  path: "templateId",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: sourceTemplate.id,
                  },
                },
              ],
            } satisfies PerformedSegmentNode,
            nodes: [],
          } satisfies SegmentDefinition,
        },
      });
    });
    it("should transfer resources", async () => {
      await transferResources({
        workspaceId: sourceWorkspace.id,
        destinationWorkspaceId: destinationWorkspace.id,
      });
      const [destinationSegment, destinationUserProperty, destinationTemplate] =
        await Promise.all([
          prisma().segment.findUniqueOrThrow({
            where: {
              workspaceId_name: {
                workspaceId: destinationWorkspace.id,
                name: sourceSegment.name,
              },
            },
          }),
          prisma().userProperty.findUniqueOrThrow({
            where: {
              workspaceId_name: {
                workspaceId: destinationWorkspace.id,
                name: sourceUserProperty.name,
              },
            },
          }),
          prisma().messageTemplate.findUniqueOrThrow({
            where: {
              workspaceId_name: {
                workspaceId: destinationWorkspace.id,
                name: sourceTemplate.name,
              },
            },
          }),
        ]);
      const destinationSegmentDefinition = unwrap(
        schemaValidateWithErr(destinationSegment.definition, SegmentDefinition),
      );
      if (
        destinationSegmentDefinition.entryNode.type !==
        SegmentNodeType.Performed
      ) {
        throw new Error("Segment entry node type is not Performed");
      }
      const segmentOperator =
        destinationSegmentDefinition.entryNode.properties?.[0]?.operator;
      if (segmentOperator?.type !== SegmentOperatorType.Equals) {
        throw new Error("Segment operator type is not Equals");
      }
      expect(segmentOperator.value).toBe(destinationTemplate.id);

      const destinationUserPropertyDefinition = unwrap(
        schemaValidateWithErr(
          destinationUserProperty.definition,
          PerformedUserPropertyDefinition,
        ),
      );
      expect(
        destinationUserPropertyDefinition.properties?.[0]?.operator.value,
      ).toBe(destinationTemplate.id);
      expect(
        destinationUserPropertyDefinition.properties?.[1]?.operator.value,
      ).toBe("missing");
    });
  });
});
