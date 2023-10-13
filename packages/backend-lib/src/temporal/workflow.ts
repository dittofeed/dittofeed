import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common/lib/errors";

export function isAlreadyStartedError(e: unknown): boolean {
  return e instanceof WorkflowExecutionAlreadyStartedError;
}
