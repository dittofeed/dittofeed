import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

export function isAlreadyStartedError(e: unknown): boolean {
  return e instanceof WorkflowExecutionAlreadyStartedError;
}
