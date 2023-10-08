// import { TestWorkflowEnvironment } from "@temporalio/testing";
// import { Worker } from "@temporalio/worker";
// import { type Config } from "backend-lib/src/config";
// import backendConfig from "backend-lib/src/config";
// import { generateDigest } from "backend-lib/src/crypto";
// import prisma from "backend-lib/src/prisma";
// import { computePropertiesWorkflow } from "backend-lib/src/segments/computePropertiesWorkflow";
// import { InternalEventType, UserEvent, Workspace } from "backend-lib/src/types";
// import { findManyInternalEvents } from "backend-lib/src/userEvents";
// import { createUserEventsTables } from "backend-lib/src/userEvents/clickhouse";
// import { segmentIdentifyEvent } from "backend-lib/test/factories/segment";
// import KafkaSkaffold from "backend-lib/test/kafkaSkaffold";
// import { createEnvAndWorker } from "backend-lib/test/temporal";
// import { sleep } from "backend-lib/test/testHelpers";
// import { randomUUID } from "crypto";
// import { WORKSPACE_ID_HEADER } from "isomorphic-lib/src/constants";
// import {
//   ChannelType,
//   JourneyDefinition,
//   JourneyNodeType,
//   JSONValue,
//   SegmentNodeType,
//   SegmentOperatorType,
//   UserPropertyDefinitionType,
// } from "isomorphic-lib/src/types";

// import buildApp from "../buildApp";

// jest.setTimeout(20000);

// jest.mock("backend-lib/src/config", () => {
//   // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
//   const backendConfigActual = jest.requireActual(
//     "backend-lib/src/config"
//   ).default;

//   return {
//     __esModule: true,
//     // eslint-disable-next-line @typescript-eslint/no-unsafe-call
//     default: jest.fn().mockReturnValue(backendConfigActual()),
//   };
// });

// describe("end to end segment webhooks", () => {
//   let workspace: Workspace;
//   let userId: string;
//   let testEnv: TestWorkflowEnvironment;
//   let worker: Worker;
//   let app: Awaited<ReturnType<typeof buildApp>>;
//   let tableVersion: string;
//   const k = new KafkaSkaffold();
//   const sharedSecret = "bac20417-432b-40a8-ac2d-81fb2744d0f7";

//   beforeAll(async () => {
//     await k.setupBeforeAll();
//   });

//   beforeEach(async () => {
//     userId = "fdd33956-10d1-41b9-9012-91c4b0c86e98";
//     tableVersion = randomUUID().replace(/-/g, "_");

//     const envAndWorker = await createEnvAndWorker();
//     testEnv = envAndWorker.testEnv;
//     worker = envAndWorker.worker;

//     await k.createTopics([backendConfig().userEventsTopicName]);
//     const backendConfigMock = backendConfig as jest.Mock<Config>;

//     backendConfigMock.mockReturnValue({
//       ...backendConfig(),
//       userEventsTopicName: k.getTopicName(backendConfig().userEventsTopicName),
//     });
//     [workspace] = await Promise.all([
//       prisma().workspace.create({
//         data: {
//           name: randomUUID(),
//         },
//       }),
//       createUserEventsTables({
//         tableVersion,
//         ingressTopic: backendConfig().userEventsTopicName,
//       }),
//     ]);

//     const [emailTemplate, paidAccountSegment] = await Promise.all([
//       prisma().messageTemplate.create({
//         data: {
//           from: "hello@email.com",
//           subject: "hi there",
//           body: "<em> {{ user.plan }} </em>",
//           name: "My Email Template",
//           workspaceId: workspace.id,
//         },
//       }),
//       prisma().segment.create({
//         data: {
//           workspaceId: workspace.id,
//           name: randomUUID(),
//           definition: {
//             entryNode: {
//               type: SegmentNodeType.Trait,
//               id: randomUUID(),
//               path: "plan",
//               operator: {
//                 type: SegmentOperatorType.Equals,
//                 value: "paid",
//               },
//             },
//             nodes: [],
//           },
//         },
//       }),
//       prisma().userProperty.create({
//         data: {
//           name: "email",
//           workspaceId: workspace.id,
//           definition: {
//             type: UserPropertyDefinitionType.Trait,
//             path: "email",
//           },
//         },
//       }),
//       prisma().userProperty.create({
//         data: {
//           name: "plan",
//           workspaceId: workspace.id,
//           definition: {
//             type: UserPropertyDefinitionType.Trait,
//             path: "plan",
//           },
//         },
//       }),
//       prisma().segmentIOConfiguration.create({
//         data: {
//           workspaceId: workspace.id,
//           sharedSecret,
//         },
//       }),
//       prisma().currentUserEventsTable.create({
//         data: {
//           workspaceId: workspace.id,
//           version: tableVersion,
//         },
//       }),
//     ]);

//     const nodeId1 = randomUUID();

//     const journeyDefinition: JourneyDefinition = {
//       entryNode: {
//         type: JourneyNodeType.EntryNode,
//         segment: paidAccountSegment.id,
//         child: nodeId1,
//       },
//       exitNode: {
//         type: JourneyNodeType.ExitNode,
//       },
//       nodes: [
//         {
//           type: JourneyNodeType.MessageNode,
//           id: nodeId1,
//           child: "ExitNode",
//           variant: {
//             type: ChannelType.Email,
//             templateId: emailTemplate.id,
//           },
//         },
//       ],
//     };

//     await prisma().journey.create({
//       data: {
//         workspaceId: workspace.id,
//         name: randomUUID(),
//         definition: journeyDefinition,
//         status: "Running",
//       },
//     });

//     app = await buildApp();
//   });

//   afterEach(async () => {
//     await Promise.all([testEnv.teardown()]);
//   });

//   afterAll(async () => {
//     await k.teardownAfterAll();
//   });

//   it("sends emails", async () => {
//     let workerError: Error | null = null;
//     await worker.runUntil(async () => {
//       try {
//         const computePropertiesWorkflowId = `segments-notification-workflow-${randomUUID()}`;
//         await testEnv.client.workflow.start(computePropertiesWorkflow, {
//           workflowId: computePropertiesWorkflowId,
//           taskQueue: "default",
//           args: [
//             {
//               tableVersion,
//               workspaceId: workspace.id,
//               maxPollingAttempts: 1200,
//               shouldContinueAsNew: false,
//               pollingJitterCoefficient: 0,
//               basePollingPeriod: 500,
//             },
//           ],
//         });
//         const messageId = "d69e965a-9f31-4f7c-b7d0-01edfe18d96e";
//         const payload = segmentIdentifyEvent({
//           userId,
//           messageId,
//           traits: {
//             plan: "paid",
//           },
//         });

//         const response = await app.inject({
//           method: "POST",
//           url: "/api/webhooks/segment",
//           headers: {
//             "x-signature": generateDigest({
//               rawBody: JSON.stringify(payload),
//               sharedSecret,
//             }),
//             [WORKSPACE_ID_HEADER]: workspace.id,
//           },
//           payload,
//         });

//         expect(response.statusCode).toBe(200);

//         let messageEvents: UserEvent[] = [];
//         const limit = 100;
//         for (let i = 0; i < limit; i++) {
//           // eslint-disable-next-line no-await-in-loop
//           messageEvents = await findManyInternalEvents({
//             event: InternalEventType.MessageSent,
//             workspaceId: workspace.id,
//           });

//           if (messageEvents.length) {
//             break;
//           }

//           if (i === limit - 1) {
//             throw new Error("Timed out waiting for message events");
//           }
//           // eslint-disable-next-line no-await-in-loop
//           await sleep(200);
//         }

//         const messageEvent = messageEvents.find(
//           // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
//           (m) => m.event === InternalEventType.MessageSent
//         );
//         if (!messageEvent) {
//           throw new Error("Missinge email message event");
//         }

//         expect(messageEvent).toEqual(
//           expect.objectContaining({
//             event: InternalEventType.MessageSent,
//             event_type: "track",
//             workspace_id: workspace.id,
//           })
//         );
//         const messageRaw = JSON.parse(messageEvent.message_raw) as JSONValue;

//         expect(messageRaw).toEqual(
//           expect.objectContaining({
//             // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
//             userId: expect.any(String),
//             // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
//             properties: expect.objectContaining({
//               messageType: ChannelType.Email,
//               to: "peter@example.com",
//               from: "hello@email.com",
//               subject: "hi there",
//               body: "<em> paid </em>",
//             }),
//           })
//         );
//       } catch (e) {
//         workerError = e as Error;
//       }
//     });

//     // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
//     if (workerError !== null) {
//       // eslint-disable-next-line @typescript-eslint/no-throw-literal
//       throw workerError;
//     }
//   });
// });
