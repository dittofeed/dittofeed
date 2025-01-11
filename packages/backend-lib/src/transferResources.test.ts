import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidateWithErr } from "isomorphic-lib/src/resultHandling/schemaValidation";

import { db, insert } from "./db";
import * as schema from "./db/schema";
import { transferResources } from "./transferResources";
import {
  ChannelType,
  MessageTemplate,
  PerformedSegmentNode,
  PerformedUserPropertyDefinition,
  Segment,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  UserProperty,
  UserPropertyDefinitionType,
  UserPropertyOperatorType,
  WebhookTemplateResource,
  Workspace,
} from "./types";
import { createWorkspace } from "./workspaces";

describe("transferResources", () => {
  describe("when the source workspace has multiple relevant resources", () => {
    let sourceWorkspace: Workspace;
    let destinationWorkspace: Workspace;
    let sourceUserProperty: UserProperty;
    let sourceSegment: Segment;
    let sourceTemplate: MessageTemplate;

    beforeEach(async () => {
      [sourceWorkspace, destinationWorkspace] = await Promise.all([
        createWorkspace({
          id: randomUUID(),
          name: `source-workspace-${randomUUID()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).then(unwrap),
        createWorkspace({
          id: randomUUID(),
          name: `destination-workspace-${randomUUID()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).then(unwrap),
      ]);

      sourceTemplate = await insert({
        table: schema.messageTemplate,
        values: {
          id: randomUUID(),
          workspaceId: sourceWorkspace.id,
          name: "webhook",
          definition: {
            type: ChannelType.Webhook,
            identifierKey: "id",
            body: "{}",
          } satisfies WebhookTemplateResource,
          updatedAt: new Date(),
          createdAt: new Date(),
        },
      }).then(unwrap);

      sourceUserProperty = await insert({
        table: schema.userProperty,
        values: {
          id: randomUUID(),
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
          updatedAt: new Date(),
          createdAt: new Date(),
        },
      }).then(unwrap);
      sourceSegment = await insert({
        table: schema.segment,
        values: {
          id: randomUUID(),
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
          updatedAt: new Date(),
          createdAt: new Date(),
        },
      }).then(unwrap);
    });
    it("should transfer resources", async () => {
      await transferResources({
        workspaceId: sourceWorkspace.id,
        destinationWorkspaceId: destinationWorkspace.id,
      });
      const [destinationSegment, destinationUserProperty, destinationTemplate] =
        await Promise.all([
          db().query.segment.findFirst({
            where: and(
              eq(schema.segment.workspaceId, destinationWorkspace.id),
              eq(schema.segment.name, sourceSegment.name),
            ),
          }),
          db().query.userProperty.findFirst({
            where: and(
              eq(schema.userProperty.workspaceId, destinationWorkspace.id),
              eq(schema.userProperty.name, sourceUserProperty.name),
            ),
          }),
          db().query.messageTemplate.findFirst({
            where: and(
              eq(schema.messageTemplate.workspaceId, destinationWorkspace.id),
              eq(schema.messageTemplate.name, sourceTemplate.name),
            ),
          }),
        ]);
      if (
        !destinationSegment ||
        !destinationUserProperty ||
        !destinationTemplate
      ) {
        throw new Error("No destination resources found");
      }
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
