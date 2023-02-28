import { Segment, Workspace } from "@prisma/client";
import { uuid4 } from "@temporalio/workflow";
import { randomUUID } from "crypto";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { segmentIdentifyEvent } from "../../../../test/factories/segment";
import { clickhouseClient } from "../../../clickhouse";
import { enrichJourney } from "../../../journeys";
import prisma from "../../../prisma";
import {
  EnrichedJourney,
  EnrichedUserProperty,
  JourneyDefinition,
  JourneyNodeType,
  MessageNodeVariantType,
  SegmentDefinition,
  SegmentHasBeenOperatorComparator,
  SegmentNodeType,
  SegmentOperatorType,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
} from "../../../types";
import {
  createUserEventsTables,
  insertUserEvents,
} from "../../../userEvents/clickhouse";
import {
  enrichedUserProperty,
  findAllUserPropertyAssignments,
} from "../../../userProperties";
import { computePropertiesPeriod } from "./computeProperties";

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
            type: MessageNodeVariantType.Email,
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
    workspace = await prisma.workspace.create({
      data: { name: `workspace-${randomUUID()}` },
    });
    segments = await Promise.all(
      segmentDefinitions.map((definition) =>
        prisma.segment.create({
          data: {
            workspaceId: workspace.id,
            name: `segment-${randomUUID()}`,
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
        await prisma.journey.create({
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
    tableVersion = randomUUID().replace(/-/g, "_");
    await createUserEventsTables({ tableVersion });
  });

  afterAll(async () => {
    await clickhouseClient().close();
  });

  describe("computePropertiesPeriod", () => {
    describe.skip("when segmenting on users who have a trait for longer than 24 hours", () => {
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
                // One day earlier than current time
                processingTime: "2021-12-31 00:15:30",
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
    });

    describe("when segmenting on users created in the last 30 minutes", () => {
      beforeEach(async () => {
        const segmentDefinition: SegmentDefinition = {
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
                processingTime: "2022-01-01 00:15:30",
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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

          beforeEach(async () => {
            const definition: UserPropertyDefinition = {
              type: UserPropertyDefinitionType.Trait,
              path: "email",
            };

            userProperty = unwrap(
              enrichedUserProperty(
                await prisma.userProperty.create({
                  data: {
                    workspaceId: workspace.id,
                    definition,
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
              processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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

            const assignment = await prisma.userPropertyAssignment.findFirst({
              where: {
                userId,
                userPropertyId: userProperty.id,
              },
            });
            expect(assignment).not.toBeNull();
            expect(assignment?.value).toBe("example@email.com");
          });
        });

        // Deprecated since supporting group queries
        describe.skip("when an unrelated identify event is submitted, which is missing a traits, or created at field", () => {
          beforeEach(async () => {
            await insertUserEvents({
              tableVersion,
              workspaceId: workspace.id,
              events: [
                {
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
              processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
              prisma.userProperty.create({
                data: {
                  workspaceId: workspace.id,
                  definition: idDefinition,
                  name: "id",
                },
              }),
              prisma.userProperty.create({
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
              processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
              tableVersion,
              subscribedJourneys: [journey],
              userProperties,
            });

            const assignments = await prisma.userPropertyAssignment.findMany({
              where: {
                userId,
                userPropertyId: {
                  in: userProperties.map((up) => up.id),
                },
              },
              orderBy: {
                userPropertyId: "desc",
              },
            });
            expect(new Set(assignments.map((a) => a.value))).toEqual(
              new Set([userId, anonymousId])
            );
          });
        });

        describe("when activity called twice with the same parameters", () => {
          it("returns the same results and produces the same signals", async () => {
            const currentTime = Date.parse("2022-01-01 00:15:45 UTC");

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
              tableVersion,
              subscribedJourneys: [journey],
              userProperties: [],
            });

            await computePropertiesPeriod({
              currentTime,
              workspaceId: workspace.id,
              processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
              tableVersion,
              subscribedJourneys: [journey],
              userProperties: [],
            });
            expect(signalWithStart).toBeCalledTimes(2);
          });
        });
      });

      describe("when a user is mistakenly labeled as having been created in the future", () => {
        beforeEach(async () => {
          await insertUserEvents({
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
        it("does not signal or creates a workflow for that existing created user", async () => {
          const currentTime = Date.parse("2022-01-01 00:16:00 UTC");

          await computePropertiesPeriod({
            workspaceId: workspace.id,
            currentTime,
            // Fast forward polling period
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:45 UTC"),
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
            tableVersion,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
          it("does not signal or creates a workflow for that existing paying user", async () => {
            const currentTime = Date.parse("2022-01-01 00:16:00 UTC");

            await computePropertiesPeriod({
              workspaceId: workspace.id,
              currentTime,
              // Fast forward polling period
              processingTimeLowerBound: Date.parse("2022-01-01 00:15:45 UTC"),
              tableVersion,
              subscribedJourneys: [journey],
              userProperties: [],
            });

            expect(signalWithStart).not.toHaveBeenCalled();
            expect(signal).not.toHaveBeenCalled();
          });
        });

        describe("when a new journey was created in the current polling period", () => {
          let newlyCreatedJourney: EnrichedJourney;
          let userId2: string;

          beforeEach(async () => {
            userId2 = `user-2-${uuid4()}`;
            newlyCreatedJourney = unwrap(
              enrichJourney(
                await prisma.journey.create({
                  data: {
                    workspaceId: workspace.id,
                    name: `user-journey-${randomUUID()}`,
                    definition: basicJourneyDefinition(uuid4(), segment.id),
                  },
                })
              )
            );

            // insert additional events within the second polling period
            await insertUserEvents({
              tableVersion,
              workspaceId: workspace.id,
              events: [
                {
                  processingTime: "2022-01-01 00:15:50",
                  messageRaw: segmentIdentifyEvent({
                    userId: userId2,
                    timestamp: "2022-01-01 00:15:00",
                    traits: {
                      plan: "paid",
                    },
                  }),
                },
              ],
            });
          });

          it("signals that new journey on all assignments, while only signalling the existing journey on new assignments", async () => {
            // Fast forward current time
            const currentTime = Date.parse("2022-01-01 00:16:00 UTC");

            await computePropertiesPeriod({
              workspaceId: workspace.id,
              currentTime,
              // Fast forward polling period
              processingTimeLowerBound: Date.parse("2022-01-01 00:15:45 UTC"),
              tableVersion,
              newComputedIds: { [newlyCreatedJourney.id]: true },
              subscribedJourneys: [journey, newlyCreatedJourney],
              userProperties: [],
            });

            if (!segments[0]) {
              fail("Test setup bug");
            }

            expect(signalWithStart).toHaveBeenCalledWith(
              expect.any(Function),
              expect.objectContaining({
                args: [
                  expect.objectContaining({
                    journeyId: journey.id,
                    userId: userId2,
                  }),
                ],
                signalArgs: [
                  expect.objectContaining({
                    segmentId: segments[0].id,
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
                    journeyId: newlyCreatedJourney.id,
                    userId,
                  }),
                ],
                signalArgs: [
                  expect.objectContaining({
                    segmentId: segments[0].id,
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
                    journeyId: newlyCreatedJourney.id,
                    userId: userId2,
                  }),
                ],
                signalArgs: [
                  expect.objectContaining({
                    segmentId: segments[0].id,
                    currentlyInSegment: true,
                  }),
                ],
              })
            );
            expect(signalWithStart).toHaveBeenCalledTimes(3);
          });
        });
      });

      describe("when has a non-paid plan", () => {
        beforeEach(async () => {
          await insertUserEvents({
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
            enrichedUserProperty(
              await prisma.userProperty.create({
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:10:15 UTC"),
            tableVersion,
            subscribedJourneys: [journey],
            userProperties: [userProperty],
          });

          let userPropertyAssignments = await findAllUserPropertyAssignments({
            userId,
          });

          expect(signalWithStart).not.toHaveBeenCalled();
          expect(signal).not.toHaveBeenCalled();
          expect(userPropertyAssignments).toEqual({});

          await insertUserEvents({
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
            tableVersion,
            workspaceId: workspace.id,
            subscribedJourneys: [journey],
            userProperties: [userProperty],
          });
          userPropertyAssignments = await findAllUserPropertyAssignments({
            userId,
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:20:15 UTC"),
            tableVersion,
            userProperties: [userProperty],
            subscribedJourneys: [journey],
          });
          userPropertyAssignments = await findAllUserPropertyAssignments({
            userId,
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
            tableVersion,
            workspaceId: workspace.id,
            events: [
              {
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
            processingTimeLowerBound: Date.parse("2022-01-01 00:15:15 UTC"),
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
