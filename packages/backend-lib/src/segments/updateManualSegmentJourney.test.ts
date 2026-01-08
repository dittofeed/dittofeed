/* eslint-disable no-await-in-loop */
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { getNewManualSegmentVersion } from "isomorphic-lib/src/segments";
import { sleep } from "isomorphic-lib/src/time";

import { createEnvAndWorker } from "../../test/temporal";
import { submitBatch } from "../apps/batch";
import { searchDeliveries } from "../deliveries";
import { upsertJourney } from "../journeys";
import logger from "../logger";
import { upsertMessageTemplate } from "../messaging";
import { getOrCreateEmailProviders } from "../messaging/email";
import { upsertSegment } from "../segments";
import {
  ChannelType,
  EmailProviderType,
  EmailTemplateResource,
  EventType,
  JourneyNodeType,
  JourneyResource,
  SearchDeliveriesResponse,
  SegmentNodeType,
  SegmentResource,
  UserPropertyDefinitionType,
  Workspace,
} from "../types";
import { findManyEventsWithCount } from "../userEvents";
import { upsertUserProperty } from "../userProperties";
import { createWorkspace } from "../workspaces/createWorkspace";
import {
  enqueueManualSegmentOperation,
  ManualSegmentOperationTypeEnum,
  manualSegmentWorkflow,
} from "./manualSegmentWorkflow";

jest.setTimeout(30000);

describe.skip("when a segment entry journey has a manual segment", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;
  let journey: JourneyResource;
  let segment: SegmentResource;

  beforeAll(async () => {
    const envAndWorker = await createEnvAndWorker();
    testEnv = envAndWorker.testEnv;
    worker = envAndWorker.worker;
  });

  afterAll(async () => {
    await testEnv.teardown();
  });

  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        name: randomUUID(),
      }),
    );
  });

  describe("and a user is added to the segment", () => {
    beforeEach(async () => {
      const [segmentInner, messageTemplate] = await Promise.all([
        upsertSegment({
          workspaceId: workspace.id,
          name: randomUUID(),
          definition: {
            entryNode: {
              id: randomUUID(),
              type: SegmentNodeType.Manual,
              version: getNewManualSegmentVersion(Date.now()),
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
            body: `
              <mjml>
                <mj-body>
                  <mj-section>
                    <mj-column>
                      <mj-text align='center'>Dittofeed Example</mj-text>
                    </mj-column>
                  </mj-section>
                </mj-body>
              </mjml>`,
            replyTo: "test@test.com",
          } satisfies EmailTemplateResource,
        }).then(unwrap),
        upsertUserProperty(
          {
            workspaceId: workspace.id,
            name: "id",
            definition: {
              type: UserPropertyDefinitionType.Id,
            },
          },
          {
            skipProtectedCheck: true,
          },
        ).then(unwrap),
        upsertUserProperty(
          {
            workspaceId: workspace.id,
            name: "email",
            definition: {
              type: UserPropertyDefinitionType.Trait,
              path: "email",
            },
          },
          {
            skipProtectedCheck: true,
          },
        ).then(unwrap),
        getOrCreateEmailProviders({
          workspaceId: workspace.id,
        }),
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
      await submitBatch({
        workspaceId: workspace.id,
        data: {
          batch: [
            {
              type: EventType.Identify,
              userId: "1",
              messageId: randomUUID(),
              traits: {
                email: "test@test.com",
              },
            },
          ],
        },
      });
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
        let deliveries: SearchDeliveriesResponse["items"] = [];
        for (let i = 0; i < 10; i++) {
          deliveries = (
            await searchDeliveries({
              workspaceId: workspace.id,
            })
          ).items;
          await sleep(1000);
          if (deliveries.length > 0) {
            break;
          }
        }
        if (!deliveries.length) {
          const events = await findManyEventsWithCount({
            workspaceId: workspace.id,
          });
          logger().error({ events }, "events after not finding deliveries");
          throw new Error("Deliveries not found");
        }
        expect(deliveries[0]?.userId).toBe("1");
        expect(deliveries[0]?.journeyId).toBe(journey.id);
      });
    });
  });
});
