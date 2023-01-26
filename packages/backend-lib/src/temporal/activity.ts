import { Context } from "@temporalio/activity";

import { CustomContext } from "./activityInboundInterceptor";

export function getContext(): CustomContext {
  return Context.current() as CustomContext;
}
