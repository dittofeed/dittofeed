import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { getNewManualSegmentVersion } from "isomorphic-lib/src/segments";
import { sleep } from "isomorphic-lib/src/time";

import { createEnvAndWorker } from "../../test/temporal";
import { insert } from "../db";
import * as schema from "../db/schema";
import { searchDeliveries } from "../deliveries";
import { upsertJourney } from "../journeys";
import { getUserJourneyWorkflowId } from "../journeys/userWorkflow";
import logger from "../logger";
import { upsertMessageTemplate } from "../messaging";
import { upsertSegment } from "../segments";
import {
  ChannelType,
  EmailProviderType,
  EmailTemplateResource,
  Journey,
  JourneyNodeType,
  JourneyResource,
  JourneyStatus,
  ManualSegmentNode,
  Segment,
  SegmentDefinition,
  SegmentNodeType,
  SegmentResource,
  UserPropertyDefinitionType,
  Workspace,
} from "../types";
import { findManyEventsWithCount, findManyInternalEvents } from "../userEvents";
import {
  insertUserPropertyAssignments,
  upsertUserProperty,
} from "../userProperties";
import { getUsers } from "../users";
import { createWorkspace } from "../workspaces/createWorkspace";
import {
  enqueueManualSegmentOperation,
  ManualSegmentOperationTypeEnum,
  manualSegmentWorkflow,
} from "./manualSegmentWorkflow";

jest.setTimeout(30000);

describe("when a segment entry journey has a manual segment", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;
  let journey: JourneyResource;
  let segment: SegmentResource;
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
      const [segmentInner, messageTemplate] = await Promise.all([
        upsertSegment({
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
        }).then(unwrap),
        upsertMessageTemplate({
          workspaceId: workspace.id,
          name: randomUUID(),
          definition: {
            type: ChannelType.Email,
            from: "test@test.com",
            subject: "test",
            body: "test",
            replyTo: "test@test.com",
          } satisfies EmailTemplateResource,
        }).then(unwrap),
        upsertUserProperty({
          workspaceId: workspace.id,
          name: "id",
          definition: {
            type: UserPropertyDefinitionType.Id,
          },
        }).then(unwrap),
        upsertUserProperty({
          workspaceId: workspace.id,
          name: "email",
          definition: {
            type: UserPropertyDefinitionType.Trait,
            path: "email",
          },
        }).then(unwrap),
      ]);
      segment = segmentInner;

      journey = unwrap(
        await upsertJourney({
          workspaceId: workspace.id,
          name: randomUUID(),
          status: "Running",
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
    it("they should be messaged", async () => {
      await worker.runUntil(async () => {
        const handle1 = await testEnv.client.workflow.signalWithStart(
          manualSegmentWorkflow,
          {
            workflowId: randomUUID(),
            taskQueue: "default",
            signal: enqueueManualSegmentOperation,
            args: [
              {
                workspaceId: workspace.id,
                segmentId: segment.id,
              },
            ],
            signalArgs: [
              {
                type: ManualSegmentOperationTypeEnum.Append,
                userIds: ["1"],
              },
            ],
          },
        );
        await handle1.result();
        await sleep(5000);
        const events = await findManyEventsWithCount({
          workspaceId: workspace.id,
        });
        logger().debug(events, "events");
        const deliveries = await searchDeliveries({
          workspaceId: workspace.id,
        });
        expect(deliveries.items.length).toBe(1);
        expect(deliveries.items[0]?.userId).toBe("1");
        expect(deliveries.items[0]?.journeyId).toBe(journey.id);
        // const handle2 = testEnv.client.workflow.getHandle(
        //   getUserJourneyWorkflowId({
        //     userId: "1",
        //     journeyId: journey.id,
        //   }),
        // );
        // await handle2.result();
      });
    });
  });
});
