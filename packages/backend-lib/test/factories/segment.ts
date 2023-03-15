import { randomUUID } from "crypto";
import deepmerge from "deepmerge";

import { JSONValue } from "../../src/types";

export function segmentTrackEvent(
  overrides: Record<string, JSONValue>
): Record<string, JSONValue> {
  return deepmerge(
    {
      anonymousId: "23adfd82-aa0f-45a7-a756-24f2a7a4c895",
      context: {
        library: {
          name: "analytics.js",
          version: "2.11.1",
        },
        page: {
          path: "/academy/",
          referrer: "",
          search: "",
          title: "Analytics Academy",
          url: "https://segment.com/academy/",
        },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.86 Safari/537.36",
        ip: "108.0.78.21",
      },
      event: "Course Clicked",
      integrations: {},
      messageId: randomUUID(),
      properties: {
        title: "Intro to Analytics",
      },
      receivedAt: "2015-12-12T19:11:01.266Z",
      sentAt: "2015-12-12T19:11:01.169Z",
      timestamp: "2015-12-12T19:11:01.249Z",
      type: "track",
      userId: "AiUGstSDIg",
      originalTimestamp: "2015-12-12T19:11:01.152Z",
    },
    overrides
  );
}

export function segmentIdentifyEvent(
  overrides: Record<string, JSONValue> = {}
): Record<string, JSONValue> {
  return deepmerge(
    {
      anonymousId: randomUUID(),
      channel: "browser",
      context: {
        ip: "8.8.8.8",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.115 Safari/537.36",
      },
      integrations: {
        All: false,
        Mixpanel: true,
        Salesforce: true,
      },
      messageId: randomUUID(),
      receivedAt: "2015-02-23T22:28:55.387Z",
      sentAt: "2015-02-23T22:28:55.111Z",
      timestamp: "2015-02-23T22:28:55.111Z",
      traits: {},
      type: "identify",
      userId: randomUUID(),
      version: "1.1",
    },
    overrides
  );
}
