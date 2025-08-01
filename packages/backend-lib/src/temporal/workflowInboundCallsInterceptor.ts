import { WorkflowClient } from "@temporalio/client";
import {
  LoggerSinks,
  Next,
  proxySinks,
  QueryInput,
  SignalInput,
  WorkflowExecuteInput,
  WorkflowInboundCallsInterceptor,
  workflowInfo,
} from "@temporalio/workflow";

const { defaultWorkerLogger: logger } = proxySinks<LoggerSinks>();

export class DittofeedWorkflowInboundInterceptor
  implements WorkflowInboundCallsInterceptor
{
  // eslint-disable-next-line class-methods-use-this
  async execute(
    input: WorkflowExecuteInput,
    next: Next<WorkflowInboundCallsInterceptor, "execute">,
  ): Promise<unknown> {
    try {
      const result = await next(input);
      return result;
    } catch (e) {
      const info = workflowInfo();

      logger.error("workflow failed", {
        err: e,
        workflowId: info.workflowId,
        workflowRunId: info.runId,
        workflowType: info.workflowType,
        taskQueue: info.taskQueue,
      });
      throw e;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async handleSignal(
    input: SignalInput,
    next: Next<WorkflowInboundCallsInterceptor, "handleSignal">,
  ): Promise<void> {
    try {
      await next(input);
    } catch (err) {
      const info = workflowInfo();
      logger.error("Signal handler failed", {
        err,
        signalName: input.signalName,
        workflowId: info.workflowId,
        workflowRunId: info.runId,
      });
      throw err;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async handleQuery(
    input: QueryInput,
    next: Next<WorkflowInboundCallsInterceptor, "handleQuery">,
  ): Promise<unknown> {
    try {
      return next(input);
    } catch (err) {
      const info = workflowInfo();
      logger.error("Query handler failed", {
        err,
        queryName: input.queryName,
        workflowId: info.workflowId,
        workflowRunId: info.runId,
      });
      throw err;
    }
  }
}

export const interceptors = () => ({
  inbound: [new DittofeedWorkflowInboundInterceptor()],
});
