import { Workspace } from "@prisma/client";
import { segmentIdentifyEvent } from "../test/factories/segment";
import config from "./config";
import { insertUserEvents } from "./userEvents/clickhouse";

describe.skip("findAllUserTraits", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    await insertUserEvents({
      tableVersion: config().defaultUserEventsTableVersion,
      workspaceId: workspace.id,
      events: [
        {
          // One day earlier than current time
          processingTime: "2021-12-31 00:15:30",
          messageRaw: segmentIdentifyEvent({
            // userId,
            // anonymousId,
            // timestamp: "2021-12-31 00:15:00",
            // traits: {
            //   status: "onboarding",
            // },
          }),
        },
      ],
    });
  });
});
