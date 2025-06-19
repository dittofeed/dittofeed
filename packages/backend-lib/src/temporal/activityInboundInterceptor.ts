import { Context } from "@temporalio/activity";
import { WorkflowClient } from "@temporalio/client";
import {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import logger from "../logger";

export interface CustomContext extends Context {
  workflowClient: WorkflowClient;
}

export class CustomActivityInboundInterceptor
  implements ActivityInboundCallsInterceptor
{
  public readonly workflowClient: WorkflowClient;

  constructor(
    ctx: Context,
    { workflowClient }: { workflowClient: WorkflowClient },
  ) {
    this.workflowClient = workflowClient;
    const customCtxt = ctx as CustomContext;
    customCtxt.workflowClient = this.workflowClient;
  }

  // eslint-disable-next-line class-methods-use-this
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">,
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err) {
      const activityInfo = Context.current().info;

      // Log the error with full stack trace
      logger().error(
        {
          err,
          activityType: activityInfo.activityType,
          activityId: activityInfo.activityId,
          workflowId: activityInfo.workflowExecution.workflowId,
          workflowRunId: activityInfo.workflowExecution.runId,
          attempt: activityInfo.attempt,
          taskQueue: activityInfo.taskQueue,
        },
        "Activity failed",
      );

      // Re-throw the error so Temporal can handle it properly
      throw err;
    }
  }
}
