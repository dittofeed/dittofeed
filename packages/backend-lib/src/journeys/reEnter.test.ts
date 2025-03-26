import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { ok } from "neverthrow";

import { createEnvAndWorker } from "../../test/temporal";
import { insert } from "../db";
import { journey as dbJourney, segment as dbSegment } from "../db/schema";
import { insertSegmentAssignments } from "../segments";
import {
  ChannelType,
  EmailProviderType,
  InternalEventType,
  Journey,
  JourneyDefinition,
  JourneyNodeType,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
  SegmentUpdate,
  TraitSegmentNode,
  Workspace,
} from "../types";
import { createWorkspace } from "../workspaces";
import {
  segmentUpdateSignal,
  userJourneyWorkflow,
  UserJourneyWorkflowVersion,
} from "./userWorkflow";
import { sendMessageFactory } from "./userWorkflow/activities";

jest.setTimeout(15000);

describe("reEnter", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  const senderMock = jest.fn().mockReturnValue(
    ok({
      type: InternalEventType.MessageSent,
      variant: {
        type: ChannelType.Email,
        from: "test@test.com",
        body: "test",
        to: "test@test.com",
        subject: "test",
        headers: {},
        replyTo: "test@test.com",
        provider: {
          type: EmailProviderType.Test,
          messageId: "test",
        },
      },
    }),
  );

  const testActivities = {
    sendMessageV2: sendMessageFactory(senderMock),
  };

  beforeEach(async () => {
    workspace = unwrap(
      await createWorkspace({
        name: `event-entry-${randomUUID()}`,
      }),
    );

    const envAndWorker = await createEnvAndWorker({
      activityOverrides: testActivities,
    });
    testEnv = envAndWorker.testEnv;
    worker = envAndWorker.worker;
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  describe("when canRunMultiple is true and the journey is run twice", () => {
    it("should run the journey twice to completion", () => {});
  });

  describe("when canRunMultiple is false and the journey is run twice", () => {
    it("should run the journey once to completion", () => {});
  });

  describe("when canRunMultiple is true and it is configured to re-enter", () => {
    describe("when the user is in the segment", () => {
      it("should run to completion and continue as new", () => {});
    });
    describe("when the user is not in the segment", () => {
      it("should run to completion and not continue as new", () => {});
    });
  });
});
