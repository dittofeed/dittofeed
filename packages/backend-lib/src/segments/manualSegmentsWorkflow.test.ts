import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { Workspace } from "../types";
import { createWorkspace } from "../workspaces/createWorkspace";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { createEnvAndWorker } from "../../test/temporal";

jest.setTimeout(15000);

describe("ManualSegmentsWorkflow", () => {
  let workspace: Workspace;
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

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

  it("should be able to run multiple append and replace operations in sequence", async () => {});
});
