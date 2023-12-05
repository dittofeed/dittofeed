import { Segment, Workspace } from "@prisma/client";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { mapValues } from "remeda";
import { Overwrite } from "utility-types";

import { clickhouseClient } from "../../../clickhouse";
import config from "../../../config";
import {
  EMAIL_EVENTS_UP_NAME,
  HUBSPOT_INTEGRATION_DEFINITION,
} from "../../../constants";
import { EMAIL_EVENTS_UP_DEFINITION } from "../../../integrations/subscriptions";
import { enrichJourney } from "../../../journeys";
import prisma, { Prisma } from "../../../prisma";
import { segmentIdentifyEvent, segmentTrackEvent } from "../../../segmentIO";
import { buildSubscriptionChangeEventInner } from "../../../subscriptionGroups";
import {
  ChannelType,
  EnrichedIntegration,
  EnrichedJourney,
  EnrichedUserProperty,
  InternalEventType,
  JourneyDefinition,
  JourneyNodeType,
  JSONValue,
  RelationalOperators,
  SegmentDefinition,
  SegmentHasBeenOperatorComparator,
  SegmentNodeType,
  SegmentOperatorType,
  SubscriptionChange,
  SubscriptionGroupType,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
} from "../../../types";
import { insertUserEvents } from "../../../userEvents";
import {
  createUserEventsTables,
  InsertValue,
} from "../../../userEvents/clickhouse";
import {
  enrichUserProperty,
  findAllUserPropertyAssignments,
  UserPropertyAssignments,
} from "../../../userProperties";
import { computePropertiesPeriod } from "./computeProperties";
import logger from "../../../logger";

const signalWithStart = jest.fn();
const signal = jest.fn();

const getHandle = jest.fn(() => ({
  signal,
}));

jest.mock("../../../temporal/activity", () => ({
  getContext: () => ({
    workflowClient: {
      signalWithStart,
      getHandle,
    },
  }),
}));

describe("compute properties activities", () => {
  let tableVersion: string;
  let userId: string;
  let segment: Segment;
  let segments: Segment[];
  let journey: EnrichedJourney;
  let workspace: Workspace;
  let anonymousId: string;

  function basicJourneyDefinition(
    nodeId1: string,
    entrySegmentId: string
  ): JourneyDefinition {
    const journeyDefinition: JourneyDefinition = {
      entryNode: {
        type: JourneyNodeType.EntryNode,
        segment: entrySegmentId,
        child: nodeId1,
      },
      exitNode: {
        type: JourneyNodeType.ExitNode,
      },
      nodes: [
        {
          type: JourneyNodeType.MessageNode,
          id: nodeId1,
          child: JourneyNodeType.ExitNode,
          variant: {
            type: ChannelType.Email,
            templateId: randomUUID(),
          },
        },
      ],
    };
    return journeyDefinition;
  }

  async function createSegmentsAndJourney(
    segmentDefinitions: SegmentDefinition[]
  ) {
    workspace = await prisma().workspace.create({
      data: { name: `workspace-${randomUUID()}` },
    });
    segments = await Promise.all(
      segmentDefinitions.map((definition, i) =>
        prisma().segment.create({
          data: {
            workspaceId: workspace.id,
            name: `segment-${i}`,
            definition,
          },
        })
      )
    );

    if (!segments[0]) {
      throw new Error("Segment not created.");
    }
    [segment] = segments;

    const nodeId1 = randomUUID();

    journey = unwrap(
      enrichJourney(
        await prisma().journey.create({
          data: {
            workspaceId: workspace.id,
            name: `user-journey-${randomUUID()}`,
            definition: basicJourneyDefinition(nodeId1, segment.id),
          },
        })
      )
    );
  }

  beforeEach(async () => {
    userId = `user-${randomUUID()}`;
    anonymousId = `anon-${randomUUID()}`;
    tableVersion = config().defaultUserEventsTableVersion;
    await createUserEventsTables({ tableVersion });
  });

  afterAll(async () => {
    await clickhouseClient().close();
  });

  type TestSegmentData = Overwrite<
    Omit<Prisma.SegmentCreateInput, "workspaceId" | "workspace">,
    {
      definition: SegmentDefinition;
    }
  >;

  type TestUserPropertyData = Overwrite<
    Omit<Prisma.UserPropertyCreateInput, "workspaceId" | "workspace">,
    {
      definition: UserPropertyDefinition;
    }
  >;

  describe("computePropertiesPeriod", () => {
    interface TableTest {
      description: string;
      skip?: boolean;
      only?: boolean;
      currentTime?: number;
      segments?: TestSegmentData[];
      userProperties?: TestUserPropertyData[];
      integrations?: Pick<EnrichedIntegration, "definition" | "name">[];
      events?: {
        eventTimeOffset: number;
        overrides?: (
          defaults: Record<string, JSONValue>
        ) => Record<string, JSONValue>;
      }[];
      expectedSignals?: {
        segmentName?: string;
        userPropertyName?: string;
        userPropertyValue?: string;
      }[];
      // map from segment name to value
      expectedSegments?: Record<string, boolean>;
      // map from user id -> user property name -> value
      expectedUserProperties?: Record<string, UserPropertyAssignments>;
    }

    const broadcastSegmentId = randomUUID();
    const broadcastSegmentId2 = randomUUID();
    const subscriptionGroupId1 = randomUUID();

    const tableTests: TableTest[] = [
      {
        description:
          "With within createdAt trait segment and iso formatted date",
        segments: [
          {
            name: "createdWithinHour",
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.And,
                children: ["2", "3"],
              },
              nodes: [
                {
                  id: "2",
                  type: SegmentNodeType.Trait,
                  path: "createdAt",
                  operator: {
                    type: SegmentOperatorType.Within,
                    windowSeconds: 60 * 60,
                  },
                },
                {
                  id: "3",
                  type: SegmentNodeType.Performed,
                  event: "createdTeam",
                  times: 1,
                  timesOperator: RelationalOperators.GreaterThanOrEqual,
                },
              ],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -(1000 * 60 * 60 + 10),
            overrides: (defaults) =>
              segmentIdentifyEvent({
                ...defaults,
                traits: {
                  createdAt: new Date(
                    new Date(defaults.timestamp as string).getTime() -
                      (1000 * 60 * 60 + 20)
                  ).toISOString(),
                },
              }),
          },
          {
            eventTimeOffset: -200,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                event: "createdTeam",
              }),
          },
        ],
        expectedSegments: {
          createdWithinHour: false,
        },
        expectedSignals: [],
      },
      {
        description:
          "When a user did submit an identify event but the segment is malformed with an empty path",
        segments: [
          {
            name: "malformed",
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Trait,
                path: "",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "",
                },
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: segmentIdentifyEvent,
          },
        ],
        expectedSegments: {
          malformed: false,
        },
        expectedSignals: [],
      },
      {
        description:
          "When a user did submit an identify event but the segment is malformed with an empty path inside of a group",
        segments: [
          {
            name: "malformed",
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.And,
                children: ["2"],
              },
              nodes: [
                {
                  id: "2",
                  type: SegmentNodeType.Trait,
                  path: "",
                  operator: {
                    type: SegmentOperatorType.Equals,
                    value: "",
                  },
                },
              ],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: segmentIdentifyEvent,
          },
        ],
        expectedSegments: {
          malformed: false,
        },
        expectedSignals: [],
      },
      {
        description:
          "When a user submits a track event with a perform segment it signals appropriately",
        segments: [
          {
            name: "performed broadcast",
            id: broadcastSegmentId,
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Performed,
                event: InternalEventType.SegmentBroadcast,
                properties: [
                  {
                    path: "segmentId",
                    operator: {
                      type: SegmentOperatorType.Equals,
                      value: broadcastSegmentId,
                    },
                  },
                ],
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                event: InternalEventType.SegmentBroadcast,
                properties: {
                  segmentId: broadcastSegmentId,
                },
              }),
          },
        ],
        expectedSegments: {
          "performed broadcast": true,
        },
        expectedSignals: [
          {
            segmentName: "performed broadcast",
          },
        ],
      },
      {
        description:
          "When a user submits a track event with a broadcast segment it signals appropriately",
        segments: [
          {
            name: "performed broadcast",
            id: broadcastSegmentId2,
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Broadcast,
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                event: InternalEventType.SegmentBroadcast,
                properties: {
                  segmentId: broadcastSegmentId2,
                },
              }),
          },
        ],
        expectedSegments: {
          "performed broadcast": true,
        },
        expectedSignals: [
          {
            segmentName: "performed broadcast",
          },
        ],
      },
      {
        description:
          "When a user did submit a track event with a 0 times perform segment it does not signal",
        segments: [
          {
            name: "did not perform",
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Performed,
                event: "EventName",
                times: 0,
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                event: "EventName",
              }),
          },
        ],
        expectedSegments: {
          "did not perform": false,
        },
        expectedSignals: [],
      },
      {
        description:
          "When a user did submit a track event with a >= 1 times perform segment it does signal",
        segments: [
          {
            name: "did perform",
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Performed,
                event: "EventName",
                times: 1,
                timesOperator: RelationalOperators.GreaterThanOrEqual,
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                event: "EventName",
              }),
          },
        ],
        expectedSegments: {
          "did perform": true,
        },
        expectedSignals: [
          {
            segmentName: "did perform",
          },
        ],
      },
      {
        description:
          "When a user did not submit a track event with a < 1 times perform segment it signals appropriately",
        segments: [
          {
            name: "did not perform",
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Performed,
                event: "EventName",
                times: 1,
                timesOperator: RelationalOperators.LessThan,
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: segmentIdentifyEvent,
          },
        ],
        expectedSegments: {
          "did not perform": true,
        },
        expectedSignals: [
          {
            segmentName: "did not perform",
          },
        ],
      },
      {
        description:
          "When a user did not submit a track event with a 0 times perform segment it signals appropriately",
        segments: [
          {
            name: "did not perform",
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Performed,
                event: "EventName",
                times: 0,
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: segmentIdentifyEvent,
          },
        ],
        expectedSegments: {
          "did not perform": true,
        },
        expectedSignals: [
          {
            segmentName: "did not perform",
          },
        ],
      },
      {
        description:
          "When a user submits a subscribe track event and then an unsubscribe track event, the user is not in the segment",
        segments: [
          {
            name: "in last value subscription group",
            id: randomUUID(),
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.SubscriptionGroup,
                subscriptionGroupId: subscriptionGroupId1,
                subscriptionGroupType: SubscriptionGroupType.OptIn,
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: (defaults) =>
              buildSubscriptionChangeEventInner({
                userId,
                subscriptionGroupId: subscriptionGroupId1,
                action: SubscriptionChange.Subscribe,
                timestamp: defaults.timestamp as string,
                messageId: defaults.messageId as string,
              }),
          },
          {
            eventTimeOffset: -500,
            overrides: (defaults) =>
              buildSubscriptionChangeEventInner({
                userId,
                subscriptionGroupId: subscriptionGroupId1,
                action: SubscriptionChange.Unsubscribe,
                timestamp: defaults.timestamp as string,
                messageId: defaults.messageId as string,
              }),
          },
        ],
        expectedSegments: {
          "in last value subscription group": false,
        },
        expectedSignals: [],
      },
      {
        description:
          "When a user submits a subscribe track event the user is in the segment",
        segments: [
          {
            name: "in opt in subscription group",
            id: randomUUID(),
            definition: {
              entryNode: {
                id: "1",
                subscriptionGroupType: SubscriptionGroupType.OptIn,
                type: SegmentNodeType.SubscriptionGroup,
                subscriptionGroupId: subscriptionGroupId1,
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: (defaults) =>
              buildSubscriptionChangeEventInner({
                userId,
                subscriptionGroupId: subscriptionGroupId1,
                action: SubscriptionChange.Subscribe,
                timestamp: defaults.timestamp as string,
                messageId: defaults.messageId as string,
              }),
          },
        ],
        expectedSegments: {
          "in opt in subscription group": true,
        },
        expectedSignals: [],
      },
      {
        description:
          "when users have not submitted any subscription change events they are not in the opt-in subscription group",
        segments: [
          {
            name: "in opt in subscription group",
            id: randomUUID(),
            definition: {
              entryNode: {
                id: "1",
                subscriptionGroupType: SubscriptionGroupType.OptIn,
                type: SegmentNodeType.SubscriptionGroup,
                subscriptionGroupId: subscriptionGroupId1,
              },
              nodes: [],
            },
          },
        ],
        events: [],
        expectedSegments: {
          "in opt in subscription group": false,
        },
        expectedSignals: [],
      },
      {
        description:
          "with opt-out subscription groups all identified users are subscribed by default",
        segments: [
          {
            name: "in opt-out subscription group",
            id: randomUUID(),
            definition: {
              entryNode: {
                id: "1",
                subscriptionGroupType: SubscriptionGroupType.OptOut,
                type: SegmentNodeType.SubscriptionGroup,
                subscriptionGroupId: subscriptionGroupId1,
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: (defaults) =>
              segmentIdentifyEvent({
                ...defaults,
                traits: {
                  email: "max@email.com",
                },
              }),
          },
        ],
        expectedSegments: {
          "in opt-out subscription group": true,
        },
        expectedSignals: [],
      },
      {
        description:
          "with opt-out subscription groups unsubscribes are respected",
        segments: [
          {
            name: "in opt-out subscription group",
            id: randomUUID(),
            definition: {
              entryNode: {
                id: "1",
                subscriptionGroupType: SubscriptionGroupType.OptOut,
                type: SegmentNodeType.SubscriptionGroup,
                subscriptionGroupId: subscriptionGroupId1,
              },
              nodes: [],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: (defaults) =>
              segmentIdentifyEvent({
                ...defaults,
                traits: {
                  email: "max@email.com",
                },
              }),
          },
          {
            eventTimeOffset: -500,
            overrides: (defaults) =>
              buildSubscriptionChangeEventInner({
                userId,
                subscriptionGroupId: subscriptionGroupId1,
                action: SubscriptionChange.Unsubscribe,
                timestamp: defaults.timestamp as string,
                messageId: defaults.messageId as string,
              }),
          },
        ],
        expectedSegments: {
          "in opt-out subscription group": false,
        },
        expectedSignals: [],
      },
      {
        description:
          "with grouped any of user property defaults to available value from performed",
        userProperties: [
          {
            name: "email",
            definition: {
              type: UserPropertyDefinitionType.Group,
              entry: "any-of",
              nodes: [
                {
                  id: "any-of",
                  type: UserPropertyDefinitionType.AnyOf,
                  children: ["trait", "performed"],
                },
                {
                  id: "performed",
                  type: UserPropertyDefinitionType.Performed,
                  event: "action",
                  path: "email",
                },
                {
                  id: "trait",
                  type: UserPropertyDefinitionType.Trait,
                  path: "email",
                },
              ],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -1000,
            overrides: (defaults) =>
              segmentIdentifyEvent({
                ...defaults,
                userId,
                traits: {
                  unrelated: "value",
                },
              }),
          },
          {
            eventTimeOffset: -500,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                userId,
                event: "action",
                properties: {
                  email: "max@email.com",
                },
              }),
          },
        ],
        expectedUserProperties: {
          "user-id-1": {
            email: "max@email.com",
          },
        },
      },
      {
        description:
          "with performed many, collects all events that match the event name",
        userProperties: [
          {
            name: "relevantEvents",
            definition: {
              type: UserPropertyDefinitionType.PerformedMany,
              or: [
                {
                  event: "action1",
                },
                {
                  event: "action2",
                },
              ],
            },
          },
        ],
        events: [
          {
            eventTimeOffset: -500,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                event: "action3",
              }),
          },
          {
            eventTimeOffset: -400,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                event: "action2",
              }),
          },
          {
            eventTimeOffset: -300,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                event: "action1",
                properties: {
                  some: "value",
                },
              }),
          },
        ],
        expectedUserProperties: {
          "user-id-1": {
            relevantEvents: [
              {
                event: "action2",
                timestamp: "2023-04-12T21:16:18",
                properties: {},
              },
              {
                event: "action1",
                timestamp: "2023-04-12T21:16:18",
                properties: {
                  some: "value",
                },
              },
            ],
          },
        },
      },
      {
        description: "with a hubspot integration, it signals appropriately",
        userProperties: [
          {
            name: EMAIL_EVENTS_UP_NAME,
            definition: EMAIL_EVENTS_UP_DEFINITION,
          },
        ],
        events: [
          {
            eventTimeOffset: -500,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                event: InternalEventType.MessageSent,
                properties: {
                  some: "property",
                },
              }),
          },
          {
            eventTimeOffset: -400,
            overrides: (defaults) =>
              segmentTrackEvent({
                ...defaults,
                event: InternalEventType.EmailClicked,
                properties: {
                  other: "property",
                },
              }),
          },
          {
            eventTimeOffset: -300,
            overrides: (defaults) =>
              segmentIdentifyEvent({
                ...defaults,
                traits: {
                  status: "onboarding",
                },
              }),
          },
          {
            eventTimeOffset: -200,
            overrides: (defaults) =>
              segmentIdentifyEvent({
                ...defaults,
                userId: "user-id-2",
                traits: {
                  unrelated: "value",
                },
              }),
          },
        ],
        integrations: [
          {
            ...HUBSPOT_INTEGRATION_DEFINITION,
            definition: {
              ...HUBSPOT_INTEGRATION_DEFINITION.definition,
              subscribedSegments: ["onboarding"],
            },
          },
        ],
        segments: [
          {
            name: "active",
            id: randomUUID(),
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Trait,
                path: "status",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "active",
                },
              },
              nodes: [],
            },
          },
          {
            name: "onboarding",
            id: randomUUID(),
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Trait,
                path: "status",
                operator: {
                  type: SegmentOperatorType.Equals,
                  value: "onboarding",
                },
              },
              nodes: [],
            },
          },
        ],
        expectedUserProperties: {
          "user-id-1": {
            [EMAIL_EVENTS_UP_NAME]: [
              {
                event: InternalEventType.MessageSent,
                properties: {
                  some: "property",
                },
                timestamp: "2023-04-12T21:16:18",
              },
              {
                event: InternalEventType.EmailClicked,
                properties: {
                  other: "property",
                },
                timestamp: "2023-04-12T21:16:18",
              },
            ],
          },
          "user-id-2": {},
        },
        expectedSignals: [
          {
            userPropertyName: EMAIL_EVENTS_UP_NAME,
            userPropertyValue: JSON.stringify(
              JSON.stringify([
                {
                  event: InternalEventType.MessageSent,
                  properties: JSON.stringify({
                    some: "property",
                  }),
                  timestamp: "2023-04-12T21:16:18",
                },
                {
                  event: InternalEventType.EmailClicked,
                  properties: JSON.stringify({
                    other: "property",
                  }),
                  timestamp: "2023-04-12T21:16:18",
                },
              ])
            ),
          },
          {
            segmentName: "onboarding",
          },
        ],
      },
      {
        description:
          "with the exists trait operator confirms that user has trait",
        events: [
          {
            eventTimeOffset: -500,
            overrides: (defaults) =>
              segmentIdentifyEvent({
                ...defaults,
                traits: {
                  phone: "1234567890",
                },
              }),
          },
        ],
        segments: [
          {
            name: "hasPhoneNumber",
            id: randomUUID(),
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Trait,
                path: "phone",
                operator: {
                  type: SegmentOperatorType.Exists,
                },
              },
              nodes: [],
            },
          },
        ],
        expectedSegments: {
          hasPhoneNumber: true,
        },
      },
      {
        description:
          "with the exists trait operator confirms that user does not have trait",
        events: [
          {
            eventTimeOffset: -500,
            overrides: (defaults) =>
              segmentIdentifyEvent({
                ...defaults,
                traits: {
                  notPhone: "abc",
                },
              }),
          },
        ],
        segments: [
          {
            name: "hasPhoneNumber",
            id: randomUUID(),
            definition: {
              entryNode: {
                id: "1",
                type: SegmentNodeType.Trait,
                path: "phone",
                operator: {
                  type: SegmentOperatorType.Exists,
                },
              },
              nodes: [],
            },
          },
        ],
        expectedSegments: {
          hasPhoneNumber: false,
        },
      },
    ];

    describe("table driven tests", () => {
      const only: null | string =
        tableTests.find((t) => t.only === true)?.description ?? null;

      test.each(
        tableTests.filter(
          (t) => t.skip !== true && (only === null || only === t.description)
        )
      )(
        "$description",
        async ({
          description,
          segments: testSegments,
          events = [],
          currentTime = 1681334178956,
          userProperties: testUserProperties,
          integrations: testIntegrations,
          expectedUserProperties,
          expectedSegments,
          expectedSignals,
        }) => {
          if (only !== null && only !== description) {
            return;
          }
          logger().debug("table test loc1");

          userId = "user-id-1";

          const eventPayloads: InsertValue[] = events.map(
            ({ eventTimeOffset, overrides }) => {
              const messageId = randomUUID();
              const defaults: Record<string, JSONValue> = {
                userId,
                messageId,
                timestamp: new Date(
                  currentTime + eventTimeOffset
                ).toISOString(),
              };

              return {
                processingTime: new Date(
                  currentTime + eventTimeOffset + 50
                ).toISOString(),
                messageId,
                messageRaw: overrides ? overrides(defaults) : defaults,
              };
            }
          );

          workspace = await prisma().workspace.create({
            data: { name: `workspace-${randomUUID()}` },
          });

          const subscribedJourneys: EnrichedJourney[] = [];
          const userProperties: EnrichedUserProperty[] = [];
          const promises: (Promise<unknown> | null)[] = [
            insertUserEvents({
              workspaceId: workspace.id,
              events: eventPayloads,
            }),
            testUserProperties?.length
              ? Promise.all(
                  testUserProperties.map((up) =>
                    prisma()
                      .userProperty.create({
                        data: {
                          workspaceId: workspace.id,
                          ...up,
                        },
                      })
                      .then((up2) =>
                        userProperties.push(up2 as EnrichedUserProperty)
                      )
                  )
                )
              : null,
          ];
          if (testSegments?.[0]) {
            const firstSegmentId = testSegments[0].id ?? randomUUID();

            promises.push(
              prisma()
                .journey.create({
                  data: {
                    workspaceId: workspace.id,
                    name: `user-journey-${randomUUID()}`,
                    definition: basicJourneyDefinition(
                      randomUUID(),
                      firstSegmentId
                    ),
                  },
                })
                .then((j) => {
                  journey = j as EnrichedJourney;
                  subscribedJourneys.push(journey);
                })
            );
            promises.push(
              prisma().segment.createMany({
                data: testSegments.map((s, i) => ({
                  workspaceId: workspace.id,
                  id: i === 0 ? firstSegmentId : undefined,
                  ...s,
                })),
              })
            );
          }

          if (testIntegrations?.length) {
            testIntegrations.forEach((integration) => {
              promises.push(
                prisma().integration.create({
                  data: {
                    workspaceId: workspace.id,
                    enabled: true,
                    ...integration,
                  },
                })
              );
            });
          }

          logger().debug("Waiting for promises to resolve loc4");
          await Promise.all(promises);

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys,
            userProperties,
          });

          const createdSegments = await prisma().segment.findMany({
            where: {
              workspaceId: workspace.id,
            },
            include: {
              SegmentAssignment: true,
            },
          });

          if (expectedSegments) {
            const segmentsRecord = createdSegments.reduce<
              Record<string, boolean>
            >((memo, s) => {
              memo[s.name] = s.SegmentAssignment[0]?.inSegment ?? false;
              return memo;
            }, {});
            expect(segmentsRecord).toEqual(expectedSegments);
          }

          if (expectedUserProperties) {
            await Promise.all(
              Object.values(
                mapValues(
                  expectedUserProperties,
                  async (expectedValue, uid) => {
                    const assignments = await findAllUserPropertyAssignments({
                      workspaceId: workspace.id,
                      userId: uid,
                    });
                    expect(assignments).toEqual(expectedValue);
                  }
                )
              )
            );
          }

          for (const {
            segmentName,
            userPropertyName,
            userPropertyValue,
          } of expectedSignals ?? []) {
            if (segmentName) {
              const segmentId = createdSegments.find(
                (s) => s.name === segmentName
              )?.id;
              if (!segmentId) {
                throw new Error(`Unable to find segment ${segmentName}`);
              }
              expect(signalWithStart).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                  signalArgs: [
                    expect.objectContaining({
                      segmentId,
                      currentlyInSegment: true,
                    }),
                  ],
                })
              );
            } else if (userPropertyName && userPropertyValue) {
              const userPropertyId = userProperties.find(
                (up) => up.name === userPropertyName
              )?.id;

              if (!userPropertyId) {
                throw new Error(
                  `Unable to find user property ${userPropertyName}`
                );
              }

              expect(signalWithStart).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                  signalArgs: [
                    expect.objectContaining({
                      userPropertyId,
                      value: userPropertyValue,
                    }),
                  ],
                })
              );
            }
          }
        }
      );
    });

    describe("when segmenting on users who have a trait for longer than 24 hours", () => {
      beforeEach(async () => {
        const segmentDefinition: SegmentDefinition = {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: randomUUID(),
            path: "status",
            operator: {
              type: SegmentOperatorType.HasBeen,
              comparator: SegmentHasBeenOperatorComparator.GTE,
              windowSeconds: 60 * 60 * 24,
              value: "onboarding",
            },
          },
          nodes: [],
        };

        await createSegmentsAndJourney([segmentDefinition]);
      });

      describe("when the user has had the trait for longer than 24 hours", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                // One day earlier than current time
                processingTime: "2021-12-31 00:15:30",
                messageId: randomUUID(),
                messageRaw: segmentIdentifyEvent({
                  userId,
                  anonymousId,
                  timestamp: "2021-12-31 00:15:00",
                  traits: {
                    status: "onboarding",
                  },
                }),
              },
            ],
          });
        });

        it("signals or creates a workflow for that user", async () => {
          // One day after status was changed
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });

          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              signalArgs: [
                expect.objectContaining({
                  segmentId: segment.id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
        });
      });

      describe("when the user has had the trait for less than 24 hours", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                // One day earlier than current time
                processingTime: "2021-12-31 00:15:30",
                messageId: randomUUID(),
                messageRaw: segmentIdentifyEvent({
                  userId,
                  anonymousId,
                  timestamp: "2021-12-31 00:15:00",
                  traits: {
                    status: "onboarding",
                  },
                }),
              },
            ],
          });
        });

        it("does not signal or create a workflow for that user", async () => {
          // One day after status was changed
          const currentTime = Date.parse("2021-12-31 12:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });

          expect(signalWithStart).not.toHaveBeenCalled();
        });
      });
    });

    describe("when segmenting on users created in the last 30 minutes", () => {
      let segmentDefinition: SegmentDefinition;

      beforeEach(async () => {
        segmentDefinition = {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: randomUUID(),
            path: "createdAt",
            operator: {
              type: SegmentOperatorType.Within,
              windowSeconds: 30 * 60,
            },
          },
          nodes: [],
        };

        await createSegmentsAndJourney([segmentDefinition]);
      });

      describe("when a user was created in the last 30 minutes", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                processingTime: "2022-01-01 00:15:30",
                messageId: randomUUID(),
                messageRaw: segmentIdentifyEvent({
                  userId,
                  anonymousId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    email: "example@email.com",
                    createdAt: "2022-01-01 00:00:00",
                  },
                }),
              },
            ],
          });
        });

        it("signals or creates a workflow for that newly created user", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });

          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              signalArgs: [
                expect.objectContaining({
                  segmentId: segment.id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
        });

        describe("when a user property is also specified", () => {
          let userProperty: EnrichedUserProperty;
          let userPropertyDefinition: UserPropertyDefinition;

          beforeEach(async () => {
            userPropertyDefinition = {
              type: UserPropertyDefinitionType.Trait,
              path: "email",
            };

            userProperty = unwrap(
              enrichUserProperty(
                await prisma().userProperty.create({
                  data: {
                    workspaceId: workspace.id,
                    definition: userPropertyDefinition,
                    name: "email",
                  },
                })
              )
            );
          });

          it("also creates that user property", async () => {
            const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              tableVersion,
              subscribedJourneys: [journey],
              userProperties: [userProperty],
            });

            expect(signalWithStart).toHaveBeenCalledWith(
              expect.any(Function),
              expect.objectContaining({
                signalArgs: [
                  expect.objectContaining({
                    segmentId: segment.id,
                    currentlyInSegment: true,
                  }),
                ],
              })
            );

            const assignments = await findAllUserPropertyAssignments({
              userId,
              workspaceId: workspace.id,
            });
            expect(assignments.email).toBe("example@email.com");
          });
        });

        describe("when a malformed user property is specified", () => {
          let userProperty: EnrichedUserProperty;
          let userPropertyDefinition: UserPropertyDefinition;

          beforeEach(async () => {
            userPropertyDefinition = {
              type: UserPropertyDefinitionType.Trait,
              path: "",
            };

            userProperty = unwrap(
              enrichUserProperty(
                await prisma().userProperty.create({
                  data: {
                    workspaceId: workspace.id,
                    definition: userPropertyDefinition,
                    name: "malformed",
                  },
                })
              )
            );
          });

          it("also creates that user property and defaults to an empty string", async () => {
            const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              tableVersion,
              subscribedJourneys: [journey],
              userProperties: [userProperty],
            });

            const assignments = await findAllUserPropertyAssignments({
              userId,
              workspaceId: workspace.id,
            });
            expect(assignments.malformed).toBeUndefined();
          });
        });

        describe("when a perform user property is also specified", () => {
          let userProperty: EnrichedUserProperty;
          let userPropertyDefinition: UserPropertyDefinition;

          beforeEach(async () => {
            userPropertyDefinition = {
              type: UserPropertyDefinitionType.Performed,
              event: "purchase",
              path: "item.name",
            };

            userProperty = unwrap(
              enrichUserProperty(
                await prisma().userProperty.create({
                  data: {
                    workspaceId: workspace.id,
                    definition: userPropertyDefinition,
                    name: "lastPurchase",
                  },
                })
              )
            );
            const trackEvent = segmentTrackEvent({
              userId,
              anonymousId,
              timestamp: "2022-01-01 00:15:05",
              event: "purchase",
              properties: {
                item: {
                  name: "hat",
                },
              },
            });

            await insertUserEvents({
              workspaceId: workspace.id,
              events: [
                {
                  processingTime: "2022-01-01 00:15:30",
                  messageId: randomUUID(),
                  messageRaw: trackEvent,
                },
              ],
            });
          });

          it("also creates that user property", async () => {
            const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              tableVersion,
              subscribedJourneys: [journey],
              userProperties: [userProperty],
            });

            const assignments = await findAllUserPropertyAssignments({
              userId,
              workspaceId: workspace.id,
            });
            expect(assignments.lastPurchase).toBe("hat");
          });
        });

        // Deprecated since supporting group queries
        describe.skip("when an unrelated identify event is submitted, which is missing a traits, or created at field", () => {
          beforeEach(async () => {
            await insertUserEvents({
              workspaceId: workspace.id,
              events: [
                {
                  messageId: randomUUID(),
                  processingTime: "2022-01-01 00:15:45",
                  messageRaw: segmentIdentifyEvent({
                    userId,
                    timestamp: "2022-01-01 00:15:15",
                    traits: {
                      unrelated: "trait",
                    },
                  }),
                },
              ],
            });
          });

          it("doesn't affect signal", async () => {
            const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              tableVersion,
              subscribedJourneys: [journey],
              userProperties: [],
            });

            expect(signalWithStart).toHaveBeenCalledWith(
              expect.any(Function),
              expect.objectContaining({
                signalArgs: [
                  expect.objectContaining({
                    segmentId: segment.id,
                    currentlyInSegment: true,
                  }),
                ],
              })
            );
          });
        });

        describe("when user id and anonymous id properties are specified", () => {
          let userProperties: EnrichedUserProperty[];

          beforeEach(async () => {
            const idDefinition: UserPropertyDefinition = {
              type: UserPropertyDefinitionType.Id,
            };
            const anonymousIdDefinition: UserPropertyDefinition = {
              type: UserPropertyDefinitionType.AnonymousId,
            };

            userProperties = (await Promise.all([
              prisma().userProperty.create({
                data: {
                  workspaceId: workspace.id,
                  definition: idDefinition,
                  name: "id",
                },
              }),
              prisma().userProperty.create({
                data: {
                  workspaceId: workspace.id,
                  definition: anonymousIdDefinition,
                  name: "anonymousId",
                },
              }),
            ])) as EnrichedUserProperty[];
          });

          it("also creates those properties", async () => {
            const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              tableVersion,
              subscribedJourneys: [journey],
              userProperties,
            });

            const assignments = await findAllUserPropertyAssignments({
              userId,
              workspaceId: workspace.id,
            });
            expect(assignments).toEqual({
              anonymousId,
              id: userId,
            });
          });
        });

        describe("when activity called twice with the same parameters", () => {
          it("only sends the signals once", async () => {
            const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              tableVersion,
              subscribedJourneys: [journey],
              userProperties: [],
            });

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              tableVersion,
              subscribedJourneys: [journey],
              userProperties: [],
            });
            expect(signalWithStart).toBeCalledTimes(1);
          });
        });

        describe("when activity called multiple times with the same parameters and an integration", () => {
          let userProperty: EnrichedUserProperty;

          beforeEach(async () => {
            await prisma().integration.create({
              data: {
                ...HUBSPOT_INTEGRATION_DEFINITION,
                enabled: true,
                workspaceId: workspace.id,
              },
            });

            userProperty = unwrap(
              enrichUserProperty(
                await prisma().userProperty.create({
                  data: {
                    workspaceId: workspace.id,
                    name: EMAIL_EVENTS_UP_NAME,
                    definition: EMAIL_EVENTS_UP_DEFINITION,
                  },
                })
              )
            );
          });

          it("only sends the signal once", async () => {
            const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

            await insertUserEvents({
              workspaceId: workspace.id,
              events: [
                {
                  messageId: randomUUID(),
                  processingTime: "2022-01-01 00:15:45",
                  messageRaw: segmentTrackEvent({
                    userId,
                    event: InternalEventType.MessageSent,
                    timestamp: "2022-01-01 00:15:15",
                  }),
                },
                {
                  messageId: randomUUID(),
                  processingTime: "2022-01-01 00:15:45",
                  messageRaw: segmentTrackEvent({
                    userId,
                    event: InternalEventType.EmailDelivered,
                    timestamp: "2022-01-01 00:25:15",
                  }),
                },
              ],
            });

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              tableVersion,
              subscribedJourneys: [],
              userProperties: [userProperty],
            });

            expect(signalWithStart).toBeCalledTimes(1);

            await insertUserEvents({
              workspaceId: workspace.id,
              events: [
                {
                  messageId: randomUUID(),
                  processingTime: "2022-01-01 00:15:45",
                  messageRaw: segmentTrackEvent({
                    userId,
                    event: InternalEventType.EmailOpened,
                    timestamp: "2022-01-01 00:35:15",
                  }),
                },
              ],
            });

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              tableVersion,
              subscribedJourneys: [],
              userProperties: [userProperty],
            });

            expect(signalWithStart).toBeCalledTimes(2);

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              tableVersion,
              subscribedJourneys: [],
              userProperties: [userProperty],
            });

            expect(signalWithStart).toBeCalledTimes(2);
          });
        });
      });

      describe("when a user is mistakenly labeled as having been created in the future", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    email: "example@email.com",
                    createdAt: "2024-01-01 00:00:00",
                  },
                }),
              },
            ],
          });
        });

        it("does not signal", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });

          expect(signalWithStart).not.toHaveBeenCalled();
        });
      });

      describe("when a user was created in the last 30 minutes with a numeric createdAt in milliseconds", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    email: "example@email.com",
                    // in milliseconds
                    createdAt: Date.parse("2022-01-01 00:00:00 UTC"),
                  },
                }),
              },
            ],
          });
        });

        it("signals or creates a workflow for that newly created user", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });

          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              signalArgs: [
                expect.objectContaining({
                  segmentId: segment.id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
        });
      });

      describe("when a user was created in the last 30 minutes with a numeric createdAt as a unix timestamp in seconds", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    email: "example@email.com",
                    createdAt: Date.parse("2022-01-01 00:00:00 UTC") / 1000,
                  },
                }),
              },
            ],
          });
        });

        it("signals or creates a workflow for that newly created user", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });

          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              signalArgs: [
                expect.objectContaining({
                  segmentId: segment.id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
        });
      });
      describe("when the user event was sent in a previous polling period", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    createdAt: "2022-01-01 00:00:00",
                  },
                }),
              },
            ],
          });
        });
        // Logic has changed sinced assignment table
        it.skip("does not signal or creates a workflow for that existing created user", async () => {
          const currentTime = Date.parse("2022-01-01 00:16:00 UTC");

          await computePropertiesPeriod({
            workspaceId: workspace.id,
            currentTime,
            // Fast forward polling period
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });

          expect(signalWithStart).not.toHaveBeenCalled();
          expect(signal).not.toHaveBeenCalled();
        });
      });

      describe("when a user was created more than 30 minutes ago", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    // created last year
                    createdAt: "2021-01-01 00:00:00",
                  },
                }),
              },
            ],
          });
        });

        it("signals false for existing user workflow", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });

          expect(signalWithStart).not.toHaveBeenCalled();
        });
      });

      describe("when multiple users were created in the last 30 minutes", () => {
        let userId2: string;
        let lastProcessedAt: string;

        beforeEach(async () => {
          userId2 = `user2-${randomUUID()}`;
          lastProcessedAt = "2022-01-01 00:15:35";

          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    createdAt: "2022-01-01 00:00:00",
                  },
                }),
              },
              {
                messageId: randomUUID(),
                processingTime: lastProcessedAt,
                messageRaw: segmentIdentifyEvent({
                  userId: userId2,
                  timestamp: "2022-01-01 00:15:05",
                  traits: {
                    createdAt: "2022-01-01 00:00:00",
                  },
                }),
              },
            ],
          });
        });

        it("signals twice, once for each user, and returns the latest processing time", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });

          expect(signalWithStart).toHaveBeenCalledTimes(2);
          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              args: [
                expect.objectContaining({
                  userId,
                }),
              ],
              signalArgs: [
                expect.objectContaining({
                  segmentId: segment.id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              args: [
                expect.objectContaining({
                  userId: userId2,
                }),
              ],
              signalArgs: [
                expect.objectContaining({
                  segmentId: segment.id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
        });
      });
    });

    describe("when segmenting users with an AND group clause", () => {
      let id1: string;
      let id2: string;
      let id3: string;

      beforeEach(async () => {
        id1 = randomUUID();
        id2 = randomUUID();
        id3 = randomUUID();

        const segmentDefinition: SegmentDefinition = {
          entryNode: {
            type: SegmentNodeType.And,
            id: id1,
            children: [id2, id3],
          },
          nodes: [
            {
              type: SegmentNodeType.Trait,
              id: id2,
              path: "trait1",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "value1",
              },
            },
            {
              type: SegmentNodeType.Trait,
              id: id3,
              path: "trait2",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "value2",
              },
            },
          ],
        };

        await createSegmentsAndJourney([segmentDefinition]);
      });

      describe("when a user has both traits", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    trait1: "value1",
                    trait2: "value2",
                  },
                }),
              },
            ],
          });
        });

        it("signals or creates a workflow for user", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });
          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              signalArgs: [
                expect.objectContaining({
                  segmentId: segment.id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
        });
      });

      describe("when a user has only 1 required trait", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    trait1: "value1",
                    trait2: "invalid",
                  },
                }),
              },
            ],
          });
        });

        it("does not signal or create a workflow for user", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });
          expect(signalWithStart).not.toHaveBeenCalled();
        });
      });
    });

    describe("when segmenting users with an OR group clause", () => {
      let id1: string;
      let id2: string;
      let id3: string;

      beforeEach(async () => {
        id1 = randomUUID();
        id2 = randomUUID();
        id3 = randomUUID();

        const segmentDefinition: SegmentDefinition = {
          entryNode: {
            type: SegmentNodeType.Or,
            id: id1,
            children: [id2, id3],
          },
          nodes: [
            {
              type: SegmentNodeType.Trait,
              id: id2,
              path: "trait1",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "value1",
              },
            },
            {
              type: SegmentNodeType.Trait,
              id: id3,
              path: "trait2",
              operator: {
                type: SegmentOperatorType.Equals,
                value: "value2",
              },
            },
          ],
        };

        await createSegmentsAndJourney([segmentDefinition]);
      });

      describe("when a user has one of the listed traits", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    trait1: "value1",
                  },
                }),
              },
            ],
          });
        });

        it("signals or creates a workflow for user", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });
          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              signalArgs: [
                expect.objectContaining({
                  segmentId: segment.id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
        });
      });

      describe("when a user has none of the listed trait", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    trait1: "invalid",
                    trait2: "invalid",
                    unknown: "invalid",
                  },
                }),
              },
            ],
          });
        });

        it("does not signal or create a workflow for user", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });
          expect(signalWithStart).not.toHaveBeenCalled();
        });
      });
    });

    describe("when segmenting on users with a paid plan", () => {
      beforeEach(async () => {
        const segmentDefinition: SegmentDefinition = {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: randomUUID(),
            path: "plan",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "paid",
            },
          },
          nodes: [],
        };

        await createSegmentsAndJourney([segmentDefinition]);
      });

      describe("when has a paid plan", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    plan: "paid",
                  },
                }),
              },
            ],
          });
        });

        it("signals or creates a workflow for that newly paying user", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });
          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              signalArgs: [
                expect.objectContaining({
                  segmentId: segment.id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
        });

        describe("when a user was signalled as a part of a previous polling period", () => {
          it.skip("does not signal or creates a workflow for that existing paying user", async () => {
            const currentTime = Date.parse("2022-01-01 00:16:00 UTC");

            await computePropertiesPeriod({
              workspaceId: workspace.id,
              currentTime,
              // Fast forward polling period
              tableVersion,
              subscribedJourneys: [journey],
              userProperties: [],
            });

            expect(signalWithStart).not.toHaveBeenCalled();
            expect(signal).not.toHaveBeenCalled();
          });
        });
      });

      describe("when has a non-paid plan", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    plan: "free",
                  },
                }),
              },
            ],
          });
        });

        it("does not signal for non-paying user", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            workspaceId: workspace.id,
            currentTime,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [],
          });

          expect(signalWithStart).not.toHaveBeenCalled();
        });
      });

      describe("when a user transitions from paying to free", () => {
        let userProperty: EnrichedUserProperty;

        beforeEach(async () => {
          const definition: UserPropertyDefinition = {
            type: UserPropertyDefinitionType.Trait,
            path: "plan",
          };

          userProperty = unwrap(
            enrichUserProperty(
              await prisma().userProperty.create({
                data: {
                  workspaceId: workspace.id,
                  definition,
                  name: "plan",
                },
              })
            )
          );
        });

        it("signals when paid, but not when becomes free", async () => {
          let currentTime = Date.parse("2022-01-01 00:10:45 UTC");
          await computePropertiesPeriod({
            workspaceId: workspace.id,
            currentTime,
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [userProperty],
          });

          let userPropertyAssignments = await findAllUserPropertyAssignments({
            userId,
            workspaceId: workspace.id,
          });

          expect(signalWithStart).not.toHaveBeenCalled();
          expect(signal).not.toHaveBeenCalled();
          expect(userPropertyAssignments).toEqual({});

          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    plan: "paid",
                  },
                }),
              },
            ],
          });

          currentTime = Date.parse("2022-01-01 00:15:45 UTC");
          await computePropertiesPeriod({
            currentTime,
            tableVersion,
            workspaceId: workspace.id,
            subscribedJourneys: [journey],
            userProperties: [userProperty],
          });
          userPropertyAssignments = await findAllUserPropertyAssignments({
            userId,
            workspaceId: workspace.id,
          });

          expect(signalWithStart).toHaveBeenCalledTimes(1);
          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              signalArgs: [
                expect.objectContaining({
                  segmentId: segment.id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
          expect(userPropertyAssignments).toEqual({ plan: "paid" });

          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:20:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:20:00",
                  traits: {
                    plan: "free",
                  },
                }),
              },
            ],
          });

          currentTime = Date.parse("2022-01-01 00:20:45 UTC");
          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            userProperties: [userProperty],
            subscribedJourneys: [journey],
          });
          userPropertyAssignments = await findAllUserPropertyAssignments({
            userId,
            workspaceId: workspace.id,
          });

          expect(signalWithStart).toHaveBeenCalledTimes(1);
          expect(userPropertyAssignments).toEqual({ plan: "free" });
        });
      });
    });

    describe("when two segments are present", () => {
      beforeEach(async () => {
        const segmentDefinition1: SegmentDefinition = {
          entryNode: {
            id: randomUUID(),
            type: SegmentNodeType.Trait,
            path: "createdAt",
            operator: {
              type: SegmentOperatorType.Within,
              windowSeconds: 30 * 60,
            },
          },
          nodes: [],
        };

        const segmentDefinition2: SegmentDefinition = {
          entryNode: {
            type: SegmentNodeType.Trait,
            id: randomUUID(),
            path: "plan",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "paid",
            },
          },
          nodes: [],
        };

        await createSegmentsAndJourney([
          segmentDefinition1,
          segmentDefinition2,
        ]);
      });

      describe("when a paid user was created recently", () => {
        beforeEach(async () => {
          await insertUserEvents({
            workspaceId: workspace.id,
            events: [
              {
                messageId: randomUUID(),
                processingTime: "2022-01-01 00:15:30",
                messageRaw: segmentIdentifyEvent({
                  userId,
                  timestamp: "2022-01-01 00:15:00",
                  traits: {
                    plan: "paid",
                    createdAt: "2022-01-01 00:00:00",
                  },
                }),
              },
            ],
          });
        });

        it("signals or creates a workflow once, only for the entry segment", async () => {
          const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

          await computePropertiesPeriod({
            currentTime,
            workspaceId: workspace.id,
            tableVersion,
            userProperties: [],
            subscribedJourneys: [journey],
          });

          if (!segments[0] || !segments[1]) {
            fail("Test setup bug");
          }

          expect(signalWithStart).toHaveBeenCalledTimes(1);
          expect(signalWithStart).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
              signalArgs: [
                expect.objectContaining({
                  segmentId: segments[0].id,
                  currentlyInSegment: true,
                }),
              ],
            })
          );
        });
      });
    });
  });
});
