import { SubmitBatchOptions, buildBatchUserEvents } from "../apps";

import { insertUserEvents } from "../userEvents";


// FIXME do event triggers
export async function submitBatch({ workspaceId, data }: SubmitBatchOptions) {
  const userEvents = buildBatchUserEvents(data);

  await insertUserEvents({
    workspaceId,
    userEvents,
  });
}
