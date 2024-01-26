import { Context } from "@temporalio/activity";
import { WorkflowClient } from "@temporalio/client";
import {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

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
  execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">,
  ): Promise<unknown> {
    return next(input);
  }
}
