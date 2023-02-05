import {
  CompletionStatus,
  DelayVariantType,
  JourneyNodeType,
  JourneyResource,
  MessageNodeVariantType,
  SegmentSplitVariantType,
} from "isomorphic-lib/src/types";
import { v4 as uuid } from "uuid";

import { JourneyState } from "../../lib/types";
import { journeyDefinitionFromState, journeyToState } from "./store";

describe("journeyToState", () => {
  let journeyResource: JourneyResource;
  let journeyId: string;
  let workspaceId: string;

  beforeEach(() => {
    journeyId = uuid();
    workspaceId = uuid();

    journeyResource = {
      id: journeyId,
      name: "My Journey",
      status: "NotStarted",
      definition: {
        entryNode: {
          type: JourneyNodeType.EntryNode,
          segment: uuid(),
          child: "908b9795-60b7-4333-a57c-a30f4972fb6b",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        nodes: [
          {
            id: "908b9795-60b7-4333-a57c-a30f4972fb6b",
            type: JourneyNodeType.MessageNode,
            child: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
            variant: {
              type: MessageNodeVariantType.Email,
              templateId: uuid(),
            },
          },
          {
            id: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
            type: JourneyNodeType.DelayNode,
            child: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
            variant: {
              type: DelayVariantType.Second,
              seconds: 1800,
            },
          },
          {
            id: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
            type: JourneyNodeType.SegmentSplitNode,
            variant: {
              type: SegmentSplitVariantType.Boolean,
              segment: uuid(),
              trueChild: "6ce89301-2a35-4562-b1db-54689bfe0e05",
              falseChild: "ExitNode",
            },
          },
          {
            id: "6ce89301-2a35-4562-b1db-54689bfe0e05",
            type: JourneyNodeType.MessageNode,
            child: JourneyNodeType.ExitNode,
            variant: {
              type: MessageNodeVariantType.Email,
              templateId: uuid(),
            },
          },
        ],
      },
      workspaceId,
    };
  });

  it("produces the correct ui state", () => {
    const uiState = journeyToState(journeyResource);
    expect(uiState).toEqual({
      journeyNodes: expect.arrayContaining([
        {
          id: "EntryNode",
          position: { x: 400, y: 100 },
          type: "journey",
          data: {
            type: "JourneyNode",
            nodeTypeProps: {
              type: "EntryNode",
              segmentId: journeyResource.definition.entryNode.segment,
            },
          },
        },
        {
          id: "908b9795-60b7-4333-a57c-a30f4972fb6b",
          position: { x: 400, y: 300 },
          type: "journey",
          data: {
            type: "JourneyNode",
            nodeTypeProps: {
              type: "MessageNode",
              templateId: journeyResource.definition.nodes.flatMap((n) =>
                n.type === JourneyNodeType.MessageNode &&
                n.id === "908b9795-60b7-4333-a57c-a30f4972fb6b"
                  ? n
                  : []
              )[0]?.variant.templateId,
              name: "Message - 908b9795-60b7-4333-a57c-a30f4972fb6b",
            },
          },
        },
        {
          id: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
          position: { x: 400, y: 500 },
          type: "journey",
          data: {
            type: "JourneyNode",
            nodeTypeProps: { type: "DelayNode", seconds: 1800 },
          },
        },
        {
          id: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          position: { x: 400, y: 700 },
          type: "journey",
          data: {
            type: "JourneyNode",
            nodeTypeProps: {
              type: "SegmentSplitNode",
              name: "True / False Branch",
              segmentId: journeyResource.definition.nodes.flatMap((n) =>
                n.type === JourneyNodeType.SegmentSplitNode &&
                n.id === "9d5367b0-882e-49c2-a6d2-4c28e5416d04"
                  ? n
                  : []
              )[0]?.variant.segment,
              trueLabelNodeId: expect.any(String),
              falseLabelNodeId: expect.any(String),
            },
          },
        },
        {
          id: expect.any(String),
          position: { x: 200, y: 900 },
          type: "label",
          data: { type: "LabelNode", title: "true" },
        },
        {
          id: expect.any(String),
          position: { x: 600, y: 900 },
          type: "label",
          data: { type: "LabelNode", title: "false" },
        },
        {
          id: "6ce89301-2a35-4562-b1db-54689bfe0e05",
          position: { x: 200, y: 1100 },
          type: "journey",
          data: {
            type: "JourneyNode",
            nodeTypeProps: {
              type: "MessageNode",
              templateId: journeyResource.definition.nodes.flatMap((n) =>
                n.type === JourneyNodeType.MessageNode &&
                n.id === "6ce89301-2a35-4562-b1db-54689bfe0e05"
                  ? n
                  : []
              )[0]?.variant.templateId,
              name: "Message - 6ce89301-2a35-4562-b1db-54689bfe0e05",
            },
          },
        },
        {
          id: expect.any(String),
          position: { x: 400, y: 1300 },
          type: "empty",
          data: { type: "EmptyNode" },
        },
        {
          id: "ExitNode",
          position: { x: 400, y: 1500 },
          type: "journey",
          data: { type: "JourneyNode", nodeTypeProps: { type: "ExitNode" } },
        },
      ]),
      journeyNodesIndex: expect.objectContaining({
        EntryNode: 0,
        ExitNode: 1,
        "908b9795-60b7-4333-a57c-a30f4972fb6b": 2,
        "6940ebec-a2ca-47dc-a356-42dc0245dd2e": 3,
        "9d5367b0-882e-49c2-a6d2-4c28e5416d04": 4,
        "6ce89301-2a35-4562-b1db-54689bfe0e05": 7,
      }),
      journeyEdges: [
        {
          id: "EntryNode=>908b9795-60b7-4333-a57c-a30f4972fb6b",
          source: "EntryNode",
          target: "908b9795-60b7-4333-a57c-a30f4972fb6b",
          type: "workflow",
        },
        {
          id: "908b9795-60b7-4333-a57c-a30f4972fb6b=>6940ebec-a2ca-47dc-a356-42dc0245dd2e",
          source: "908b9795-60b7-4333-a57c-a30f4972fb6b",
          target: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
          type: "workflow",
        },
        {
          id: "6940ebec-a2ca-47dc-a356-42dc0245dd2e=>9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          source: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
          target: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          type: "workflow",
        },
        {
          id: expect.any(String),
          source: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          target: expect.any(String),
          type: "placeholder",
        },
        {
          id: expect.any(String),
          source: expect.any(String),
          target: "6ce89301-2a35-4562-b1db-54689bfe0e05",
          type: "workflow",
        },
        {
          id: expect.any(String),
          source: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          target: expect.any(String),
          type: "placeholder",
        },
        {
          id: expect.any(String),
          source: expect.any(String),
          target: expect.any(String),
          type: "workflow",
        },
        {
          id: expect.any(String),
          source: expect.any(String),
          target: expect.any(String),
          type: "workflow",
        },
        {
          id: expect.any(String),
          source: expect.any(String),
          target: "ExitNode",
          type: "workflow",
        },
      ],
      journeyName: "My Journey",
    });
  });
});

describe("journeyDefinitionFromState", () => {
  let state: JourneyState;

  beforeEach(() => {
    state = {
      journeySelectedNodeId: null,
      journeyUpdateRequest: {
        type: CompletionStatus.NotStarted,
      },
      journeyNodes: [
        {
          id: JourneyNodeType.EntryNode,
          data: {
            type: "JourneyNode",
            nodeTypeProps: {
              type: JourneyNodeType.EntryNode,
              segmentId: uuid(),
            },
          },
          position: { x: 400, y: 100 },
          type: "journey",
          width: 300,
          height: 90,
          selected: false,
        },
        {
          id: "908b9795-60b7-4333-a57c-a30f4972fb6b",
          data: {
            type: "JourneyNode",
            nodeTypeProps: {
              type: JourneyNodeType.MessageNode,
              name: "Message 1",
              templateId: uuid(),
            },
          },
          position: { x: 400, y: 300 },
          type: "journey",
          width: 300,
          height: 90,
        },
        {
          id: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
          data: {
            type: "JourneyNode",
            nodeTypeProps: { type: JourneyNodeType.DelayNode, seconds: 1800 },
          },
          position: { x: 400, y: 500 },
          type: "journey",
          width: 300,
          height: 82,
          selected: false,
        },
        {
          id: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          data: {
            type: "JourneyNode",
            nodeTypeProps: {
              type: JourneyNodeType.SegmentSplitNode,
              segmentId: uuid(),
              name: "True / False Branch",
              trueLabelNodeId: "c1191029-49bd-4947-8ff9-9a43b64261e9",
              falseLabelNodeId: "70c82013-c7a5-4b55-93ba-4158c500b79d",
            },
          },
          position: { x: 400, y: 700 },
          type: "journey",
          width: 300,
          height: 90,
        },
        {
          id: "c1191029-49bd-4947-8ff9-9a43b64261e9",
          data: { type: "LabelNode", title: "true" },
          position: { x: 200, y: 900 },
          type: "label",
          width: 44,
          height: 38,
        },
        {
          id: "6ce89301-2a35-4562-b1db-54689bfe0e05",
          data: {
            type: "JourneyNode",
            nodeTypeProps: {
              type: JourneyNodeType.MessageNode,
              name: "Message 2",
              templateId: uuid(),
            },
          },
          position: { x: 200, y: 1100 },
          type: "journey",
          width: 300,
          height: 90,
        },
        {
          id: "0492df84-8c15-419a-9d8d-8856ae2a4e73",
          data: { type: "EmptyNode" },
          position: { x: 400, y: 1300 },
          type: "empty",
          width: 8,
          height: 8,
        },
        {
          id: JourneyNodeType.ExitNode,
          data: {
            type: "JourneyNode",
            nodeTypeProps: { type: JourneyNodeType.ExitNode },
          },
          position: { x: 400, y: 1500 },
          type: "journey",
          width: 300,
          height: 60,
        },
        {
          id: "70c82013-c7a5-4b55-93ba-4158c500b79d",
          data: { type: "LabelNode", title: "false" },
          position: { x: 600, y: 900 },
          type: "label",
          width: 49,
          height: 38,
        },
      ],
      journeyEdges: [
        {
          id: "908b9795-60b7-4333-a57c-a30f4972fb6b->6940ebec-a2ca-47dc-a356-42dc0245dd2e",
          source: "908b9795-60b7-4333-a57c-a30f4972fb6b",
          target: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
          type: "workflow",
        },
        {
          id: "EntryNode->908b9795-60b7-4333-a57c-a30f4972fb6b",
          source: "EntryNode",
          target: "908b9795-60b7-4333-a57c-a30f4972fb6b",
          type: "workflow",
        },
        {
          id: "6940ebec-a2ca-47dc-a356-42dc0245dd2e->9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          source: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
          target: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          type: "workflow",
        },
        {
          id: "9d5367b0-882e-49c2-a6d2-4c28e5416d04->c1191029-49bd-4947-8ff9-9a43b64261e9",
          source: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          target: "c1191029-49bd-4947-8ff9-9a43b64261e9",
          type: "placeholder",
        },
        {
          id: "9d5367b0-882e-49c2-a6d2-4c28e5416d04->70c82013-c7a5-4b55-93ba-4158c500b79d",
          source: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          target: "70c82013-c7a5-4b55-93ba-4158c500b79d",
          type: "placeholder",
        },
        {
          id: "70c82013-c7a5-4b55-93ba-4158c500b79d->0492df84-8c15-419a-9d8d-8856ae2a4e73",
          source: "70c82013-c7a5-4b55-93ba-4158c500b79d",
          target: "0492df84-8c15-419a-9d8d-8856ae2a4e73",
          data: { type: "WorkflowEdge", disableMarker: true },
          type: "workflow",
        },
        {
          id: "0492df84-8c15-419a-9d8d-8856ae2a4e73->ExitNode",
          source: "0492df84-8c15-419a-9d8d-8856ae2a4e73",
          target: "ExitNode",
          type: "workflow",
        },
        {
          id: "6ce89301-2a35-4562-b1db-54689bfe0e05->0492df84-8c15-419a-9d8d-8856ae2a4e73",
          source: "6ce89301-2a35-4562-b1db-54689bfe0e05",
          target: "0492df84-8c15-419a-9d8d-8856ae2a4e73",
          type: "workflow",
        },
        {
          id: "c1191029-49bd-4947-8ff9-9a43b64261e9->6ce89301-2a35-4562-b1db-54689bfe0e05",
          source: "c1191029-49bd-4947-8ff9-9a43b64261e9",
          target: "6ce89301-2a35-4562-b1db-54689bfe0e05",
          type: "workflow",
        },
      ],
      journeyNodesIndex: {
        EntryNode: 0,
        "908b9795-60b7-4333-a57c-a30f4972fb6b": 1,
        "6940ebec-a2ca-47dc-a356-42dc0245dd2e": 2,
        "9d5367b0-882e-49c2-a6d2-4c28e5416d04": 3,
        "c1191029-49bd-4947-8ff9-9a43b64261e9": 4,
        "6ce89301-2a35-4562-b1db-54689bfe0e05": 5,
        "0492df84-8c15-419a-9d8d-8856ae2a4e73": 6,
        ExitNode: 7,
        "70c82013-c7a5-4b55-93ba-4158c500b79d": 8,
      },
      journeyDraggedComponentType: null,
      journeyName: "My Journey",
    };
  });

  it("returns a journey definition", () => {
    const result = journeyDefinitionFromState({
      state,
    });
    if (result.isErr()) {
      throw new Error(
        `journeyResourceFromState failed with ${result.error.message}`
      );
    }
    expect(result.value).toEqual({
      entryNode: {
        type: JourneyNodeType.EntryNode,
        segment: expect.any(String),
        child: "908b9795-60b7-4333-a57c-a30f4972fb6b",
      },
      exitNode: {
        type: JourneyNodeType.ExitNode,
      },
      nodes: [
        {
          id: "908b9795-60b7-4333-a57c-a30f4972fb6b",
          type: JourneyNodeType.MessageNode,
          child: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
          variant: {
            type: MessageNodeVariantType.Email,
            templateId: expect.any(String),
          },
        },
        {
          id: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
          type: JourneyNodeType.DelayNode,
          child: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          variant: {
            type: "Second",
            seconds: 1800,
          },
        },
        {
          id: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          type: JourneyNodeType.SegmentSplitNode,
          variant: {
            type: SegmentSplitVariantType.Boolean,
            segment: expect.any(String),
            trueChild: "6ce89301-2a35-4562-b1db-54689bfe0e05",
            falseChild: "ExitNode",
          },
        },
        {
          id: "6ce89301-2a35-4562-b1db-54689bfe0e05",
          type: JourneyNodeType.MessageNode,
          child: JourneyNodeType.ExitNode,
          variant: {
            type: MessageNodeVariantType.Email,
            templateId: expect.any(String),
          },
        },
      ],
    });
  });
});
