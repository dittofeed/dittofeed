import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { getNewManualSegmentVersion } from "isomorphic-lib/src/segments";

import { createEnvAndWorker } from "../../test/temporal";
import { insert } from "../db";
import * as schema from "../db/schema";
import {
  ChannelType,
  EmailProviderType,
  EmailTemplateResource,
  Journey,
  JourneyNodeType,
  ManualSegmentNode,
  Segment,
  SegmentDefinition,
  SegmentNodeType,
  UserPropertyDefinitionType,
  Workspace,
} from "../types";
import { insertUserPropertyAssignments } from "../userProperties";
import { getUsers } from "../users";
import { createWorkspace } from "../workspaces/createWorkspace";
import {
  enqueueManualSegmentOperation,
  ManualSegmentOperationTypeEnum,
  manualSegmentWorkflow,
} from "./manualSegmentWorkflow";
import { upsertJourney } from "../journeys";
import { upsertSegment } from "../segments";
import { upsertMessageTemplate } from "../messaging";

jest.setTimeout(15000);

describe("when a segment entry journey has a manual segment", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;
  let journey: Journey;
  let segment: Segment;
  let now: number;

  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        name: randomUUID(),
      }),
    );

    const envAndWorker = await createEnvAndWorker();
    testEnv = envAndWorker.testEnv;
    worker = envAndWorker.worker;
  });
  describe("and a user is added to the segment", () => {
    beforeEach(async () => {
      now = await testEnv.currentTimeMs();
      segment = unwrap(
        await upsertSegment({
          workspaceId: workspace.id,
          name: randomUUID(),
          definition: {
            entryNode: {
              id: randomUUID(),
              type: SegmentNodeType.Manual,
              version: getNewManualSegmentVersion(now),
            },
            nodes: [],
          },
        }),
      );
      const messageTemplate = unwrap(
        await upsertMessageTemplate({
          workspaceId: workspace.id,
          name: randomUUID(),
          definition: {
            type: ChannelType.Email,
            from: "test@test.com",
            subject: "test",
            body: "test",
            replyTo: "test@test.com",
          } satisfies EmailTemplateResource,
        }),
      );
      journey = unwrap(
        await upsertJourney({
          workspaceId: workspace.id,
          name: randomUUID(),
          definition: {
            nodes: [
              {
                id: "message",
                type: JourneyNodeType.MessageNode,
                child: JourneyNodeType.ExitNode,
                variant: {
                  type: ChannelType.Email,
                  templateId: messageTemplate.id,
                  providerOverride: EmailProviderType.Test,
                },
              },
            ],
            entryNode: {
              type: JourneyNodeType.SegmentEntryNode,
              segment: segment.id,
              child: "message",
            },
            exitNode: {
              type: JourneyNodeType.ExitNode,
            },
          },
        }),
      );
    });
    it("they should be messaged", () => {});
  });
});
