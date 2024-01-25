import { findDirectChildren } from "isomorphic-lib/src/journeys";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import {
  ChannelType,
  CompletionStatus,
  DelayVariantType,
  JourneyDefinition,
  JourneyNodeType,
  JourneyResource,
  SegmentSplitVariantType,
} from "isomorphic-lib/src/types";
import { v4 as uuid } from "uuid";

import { JourneyState } from "../../lib/types";
import {
  findDirectUiChildren,
  findDirectUiParents,
  journeyDefinitionFromState,
  JourneyStateForResource,
  journeyToState,
} from "./store";

describe("journeyToState", () => {
  let journeyResource: JourneyResource;
  let journeyId: string;
  let workspaceId: string;
  let uiState: JourneyStateForResource;
  let definitionFromState: JourneyDefinition;

  describe("with a triple nested segment split", () => {
    beforeEach(() => {
      const definition: JourneyDefinition = {
        nodes: [
          {
            id: "segment-split-1",
            type: JourneyNodeType.SegmentSplitNode,
            variant: {
              type: SegmentSplitVariantType.Boolean,
              segment: "segment-id",
              trueChild: JourneyNodeType.ExitNode,
              falseChild: "segment-split-2",
            },
          },
          {
            id: "segment-split-2",
            type: JourneyNodeType.SegmentSplitNode,
            variant: {
              type: SegmentSplitVariantType.Boolean,
              segment: "segment-id",
              trueChild: JourneyNodeType.ExitNode,
              falseChild: "segment-split-3",
            },
          },
          {
            id: "segment-split-3",
            type: JourneyNodeType.SegmentSplitNode,
            variant: {
              type: SegmentSplitVariantType.Boolean,
              segment: "segment-id",
              trueChild: JourneyNodeType.ExitNode,
              falseChild: JourneyNodeType.ExitNode,
            },
          },
        ],
        entryNode: {
          type: JourneyNodeType.EntryNode,
          child: "segment-split-1",
          segment: "segment-id",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
      };

      journeyId = uuid();
      workspaceId = uuid();
      journeyResource = {
        id: journeyId,
        name: "My Journey",
        status: "NotStarted",
        definition,
        workspaceId,
      };

      journeyId = uuid();
      workspaceId = uuid();
      journeyResource = {
        id: journeyId,
        name: "My Journey",
        status: "NotStarted",
        definition,
        workspaceId,
      };
      uiState = journeyToState(journeyResource);
    });

    const uiExpectations: [string, string[]][] = [
      [JourneyNodeType.EntryNode, ["segment-split-1"]],
      [
        "segment-split-1",
        ["segment-split-1-child-0", "segment-split-1-child-1"],
      ],
      ["segment-split-1-child-0", ["segment-split-1-empty"]],
      ["segment-split-1-child-1", ["segment-split-2"]],
      ["segment-split-1-empty", [JourneyNodeType.ExitNode]],
      [
        "segment-split-2",
        ["segment-split-2-child-0", "segment-split-2-child-1"],
      ],
      ["segment-split-2-child-0", ["segment-split-2-empty"]],
      ["segment-split-2-child-1", ["segment-split-3"]],
      ["segment-split-2-empty", ["segment-split-1-empty"]],
      [
        "segment-split-3",
        ["segment-split-3-child-0", "segment-split-3-child-1"],
      ],
      ["segment-split-3-child-0", ["segment-split-3-empty"]],
      ["segment-split-3-child-1", ["segment-split-3-empty"]],
      ["segment-split-3-empty", ["segment-split-2-empty"]],
    ];
    test.each(uiExpectations)(
      "node %p has %p as children in ui state",
      (nodeId, expectedChildren) => {
        const actualChildren = findDirectUiChildren(
          nodeId,
          uiState.journeyEdges,
        );
        expect(new Set(actualChildren)).toEqual(new Set(expectedChildren));
      },
    );
  });

  describe("with a simple segment split", () => {
    beforeEach(() => {
      const definition: JourneyDefinition = {
        nodes: [
          {
            id: "segment-split",
            type: JourneyNodeType.SegmentSplitNode,
            variant: {
              type: SegmentSplitVariantType.Boolean,
              segment: "segment-id",
              trueChild: JourneyNodeType.ExitNode,
              falseChild: JourneyNodeType.ExitNode,
            },
          },
        ],
        entryNode: {
          type: JourneyNodeType.EntryNode,
          child: "segment-split",
          segment: "segment-id",
        },
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
      };

      journeyId = uuid();
      workspaceId = uuid();
      journeyResource = {
        id: journeyId,
        name: "My Journey",
        status: "NotStarted",
        definition,
        workspaceId,
      };
      uiState = journeyToState(journeyResource);
    });

    it("produces the right ui state", async () => {
      const uiExpectations: [string, string[]][] = [
        [JourneyNodeType.EntryNode, ["segment-split"]],
        ["segment-split", ["segment-split-child-0", "segment-split-child-1"]],
        ["segment-split-child-0", ["segment-split-empty"]],
        ["segment-split-child-1", ["segment-split-empty"]],
        ["segment-split-empty", [JourneyNodeType.ExitNode]],
      ];

      for (const [nodeId, expectedChildren] of uiExpectations) {
        const actualChildren = findDirectUiChildren(
          nodeId,
          uiState.journeyEdges,
        );
        expect(new Set(actualChildren)).toEqual(new Set(expectedChildren));
      }

      const result = await journeyDefinitionFromState({ state: uiState });
      if (result.isErr()) {
        throw new Error(JSON.stringify(result.error));
      }
      const definition = result.value;

      const definitionExpectations: [string, string[]][] = [
        [JourneyNodeType.EntryNode, ["segment-split"]],
        ["segment-split", [JourneyNodeType.ExitNode]],
      ];

      for (const [nodeId, expectedChildren] of definitionExpectations) {
        const actualChildren = findDirectChildren(nodeId, definition);
        expect(actualChildren).toEqual(new Set(expectedChildren));
      }
    });
  });

  describe("when journey has nested wait for's", () => {
    beforeEach(async () => {
      const definition: JourneyDefinition = {
        nodes: [
          {
            id: "wait-for-first-deployment-1",
            type: JourneyNodeType.WaitForNode,
            timeoutChild: "code-deployment-reminder-1a",
            timeoutSeconds: 604800,
            segmentChildren: [
              {
                id: "wait-for-first-deployment-2",
                segmentId: "deployment-segment-id",
              },
            ],
          },
          {
            id: "code-deployment-reminder-1a",
            name: "Code Deployment Reminder 1a",
            type: JourneyNodeType.MessageNode,
            child: "wait-for-first-deployment-2",
            variant: {
              type: ChannelType.Email,
              templateId: "4bad6541-aabf-46ce-a51e-0702773b8397",
            },
            subscriptionGroupId: "05e11d83-0b16-4ac3-9c86-b53a25967781",
          },
          {
            id: "wait-for-first-deployment-2",
            type: JourneyNodeType.WaitForNode,
            timeoutChild: "ExitNode",
            timeoutSeconds: 604800,
            segmentChildren: [
              {
                id: "wait-for-onboarding-1",
                segmentId: "deployment-segment-id",
              },
            ],
          },
          {
            id: "wait-for-onboarding-1",
            type: JourneyNodeType.WaitForNode,
            timeoutChild: "onboarding-segment-split-received-a",
            timeoutSeconds: 604800,
            segmentChildren: [
              {
                id: "wait-for-onboarding-2",
                segmentId: "onboarding-segment-id",
              },
            ],
          },
          {
            id: "onboarding-segment-split-received-a",
            type: JourneyNodeType.SegmentSplitNode,
            variant: {
              type: SegmentSplitVariantType.Boolean,
              segment: "84daa056-f768-4f5a-aad3-5afe1567df18",
              trueChild: "onboarding-reminder-2b",
              falseChild: "onboarding-reminder-2a",
            },
          },
          {
            id: "onboarding-reminder-2a",
            name: "Onboarding Reminder 2a",
            type: JourneyNodeType.MessageNode,
            child: "wait-for-onboarding-2",
            variant: {
              type: ChannelType.Email,
              templateId: "9227c35b-2a05-4c04-a703-ddec48006b01",
            },
            subscriptionGroupId: "05e11d83-0b16-4ac3-9c86-b53a25967781",
          },
          {
            id: "onboarding-reminder-2b",
            name: "Onboarding Reminder 2b",
            type: JourneyNodeType.MessageNode,
            child: "wait-for-onboarding-2",
            variant: {
              type: ChannelType.Email,
              templateId: "2dc8bf8b-92db-4e37-8c0d-47031647d99c",
            },
            subscriptionGroupId: "05e11d83-0b16-4ac3-9c86-b53a25967781",
          },
          {
            id: "wait-for-onboarding-2",
            type: JourneyNodeType.WaitForNode,
            timeoutChild: "ExitNode",
            timeoutSeconds: 604800,
            segmentChildren: [
              {
                id: "ExitNode",
                segmentId: "onboarding-segment-id",
              },
            ],
          },
        ],
        exitNode: {
          type: JourneyNodeType.ExitNode,
        },
        entryNode: {
          type: JourneyNodeType.EntryNode,
          child: "wait-for-first-deployment-1",
          segment: "project-added-segment-id",
        },
      };

      journeyId = uuid();
      workspaceId = uuid();
      journeyResource = {
        id: journeyId,
        name: "My Journey",
        status: "NotStarted",
        definition,
        workspaceId,
      };
      uiState = journeyToState(journeyResource);

      definitionFromState = unwrap(
        await journeyDefinitionFromState({ state: uiState }),
      );
    });
    const uiExpectations: [string, string[]][] = [
      [JourneyNodeType.EntryNode, ["wait-for-first-deployment-1"]],
      [
        "wait-for-first-deployment-1",
        [
          "wait-for-first-deployment-1-child-0",
          "wait-for-first-deployment-1-child-1",
        ],
      ],
      [
        "wait-for-first-deployment-1-child-0",
        ["wait-for-first-deployment-1-empty"],
      ],
      ["wait-for-first-deployment-1-child-1", ["code-deployment-reminder-1a"]],
      ["code-deployment-reminder-1a", ["wait-for-first-deployment-1-empty"]],
      ["wait-for-first-deployment-1-empty", ["wait-for-first-deployment-2"]],
      [
        "wait-for-first-deployment-2",
        [
          "wait-for-first-deployment-2-child-0",
          "wait-for-first-deployment-2-child-1",
        ],
      ],
      ["wait-for-first-deployment-2-child-0", ["wait-for-onboarding-1"]],
      [
        "wait-for-first-deployment-2-child-1",
        ["wait-for-first-deployment-2-empty"],
      ],
      [
        "wait-for-onboarding-1",
        ["wait-for-onboarding-1-child-0", "wait-for-onboarding-1-child-1"],
      ],
      ["wait-for-onboarding-1-child-0", ["wait-for-onboarding-1-empty"]],
      [
        "wait-for-onboarding-1-child-1",
        ["onboarding-segment-split-received-a"],
      ],
      [
        "onboarding-segment-split-received-a",
        [
          "onboarding-segment-split-received-a-child-1",
          "onboarding-segment-split-received-a-child-0",
        ],
      ],
    ];

    test.each(uiExpectations)(
      "node %p has %p as children in ui state",
      (nodeId, expectedChildren) => {
        const actualChildren = findDirectUiChildren(
          nodeId,
          uiState.journeyEdges,
        );
        expect(new Set(actualChildren)).toEqual(new Set(expectedChildren));
      },
    );

    const expectations: [string, string[]][] = [
      [JourneyNodeType.EntryNode, ["wait-for-first-deployment-1"]],
      [
        "wait-for-first-deployment-1",
        ["code-deployment-reminder-1a", "wait-for-first-deployment-2"],
      ],
      [
        "wait-for-first-deployment-2",
        [JourneyNodeType.ExitNode, "wait-for-onboarding-1"],
      ],
      [
        "wait-for-onboarding-1",
        ["wait-for-onboarding-2", "onboarding-segment-split-received-a"],
      ],
      [
        "onboarding-segment-split-received-a",
        ["onboarding-reminder-2a", "onboarding-reminder-2b"],
      ],
      ["onboarding-reminder-2a", ["wait-for-onboarding-2"]],
      ["onboarding-reminder-2b", ["wait-for-onboarding-2"]],
      ["wait-for-onboarding-2", [JourneyNodeType.ExitNode]],
    ];

    test.each(expectations)(
      "node %p has %p as children in definition from state",
      (nodeId, expectedChildren) => {
        const actualChildren = findDirectChildren(nodeId, definitionFromState);
        expect(actualChildren).toEqual(new Set(expectedChildren));
      },
    );

    it("doesn't contain isolated nodes", async () => {
      uiState.journeyNodes.forEach((node) => {
        if (
          // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
          node.id === JourneyNodeType.EntryNode ||
          // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
          node.id === JourneyNodeType.ExitNode
        ) {
          return;
        }
        const ch = findDirectUiChildren(node.id, uiState.journeyEdges);
        const pa = findDirectUiParents(node.id, uiState.journeyEdges);
        expect(ch.length).toBeGreaterThan(0);
        expect(pa.length).toBeGreaterThan(0);
      });
    });
  });
  describe("when journey has split then delay", () => {
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
            child: "message-1",
          },
          exitNode: {
            type: JourneyNodeType.ExitNode,
          },
          nodes: [
            {
              id: "message-1",
              type: JourneyNodeType.MessageNode,
              child: "delay",
              variant: {
                type: ChannelType.Email,
                templateId: uuid(),
              },
            },
            {
              id: "delay",
              type: JourneyNodeType.DelayNode,
              child: "segment-split",
              variant: {
                type: DelayVariantType.Second,
                seconds: 1800,
              },
            },
            {
              id: "segment-split",
              type: JourneyNodeType.SegmentSplitNode,
              variant: {
                type: SegmentSplitVariantType.Boolean,
                segment: uuid(),
                trueChild: "message-2",
                falseChild: "ExitNode",
              },
            },
            {
              id: "message-2",
              type: JourneyNodeType.MessageNode,
              child: JourneyNodeType.ExitNode,
              variant: {
                type: ChannelType.Email,
                templateId: uuid(),
              },
            },
          ],
        },
        workspaceId,
      };
      uiState = journeyToState(journeyResource);
    });

    it("produces the correct ui state", async () => {
      const result = await journeyDefinitionFromState({ state: uiState });
      if (result.isErr()) {
        throw new Error(JSON.stringify(result.error));
      }
      const definition = result.value;

      const expectations: [string, string[]][] = [
        [JourneyNodeType.EntryNode, ["message-1"]],
        ["message-1", ["delay"]],
        ["delay", ["segment-split"]],
        ["segment-split", ["message-2", JourneyNodeType.ExitNode]],
        ["message-2", [JourneyNodeType.ExitNode]],
      ];

      for (const [nodeId, expectedChildren] of expectations) {
        const actualChildren = findDirectChildren(nodeId, definition);
        expect(actualChildren).toEqual(new Set(expectedChildren));
      }
    });
  });

  describe("when a journey has a split, and a nested split", () => {
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
            child: "9d5367b0-882e-49c2-a6d2-4c28e5416d04",
          },
          exitNode: {
            type: JourneyNodeType.ExitNode,
          },
          nodes: [
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
              type: JourneyNodeType.SegmentSplitNode,
              variant: {
                type: SegmentSplitVariantType.Boolean,
                segment: uuid(),
                trueChild: "ExitNode",
                falseChild: "ExitNode",
              },
            },
          ],
        },
        workspaceId,
      };
      uiState = journeyToState(journeyResource);
    });

    it("produces the correct ui state", () => {
      expect(
        uiState.journeyNodes.filter((n) => n.type === "label"),
      ).toHaveLength(4);

      expect(
        uiState.journeyNodes.filter((n) => n.type === "empty"),
      ).toHaveLength(2);
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
      journeyStatsRequest: {
        type: CompletionStatus.NotStarted,
      },
      journeyStats: {},
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
              channel: ChannelType.Email,
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
            nodeTypeProps: {
              type: JourneyNodeType.DelayNode,
              variant: {
                type: DelayVariantType.Second,
                seconds: 1800,
              },
            },
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
              channel: ChannelType.Email,
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
        `journeyResourceFromState failed with ${result.error.message}`,
      );
    }
    const { exitNode, entryNode, nodes } = result.value;
    expect(entryNode).toEqual({
      type: JourneyNodeType.EntryNode,
      segment: expect.any(String),
      child: "908b9795-60b7-4333-a57c-a30f4972fb6b",
    });
    expect(exitNode).toEqual({
      type: JourneyNodeType.ExitNode,
    });

    const expectedNodes = [
      {
        id: "908b9795-60b7-4333-a57c-a30f4972fb6b",
        type: JourneyNodeType.MessageNode,
        child: "6940ebec-a2ca-47dc-a356-42dc0245dd2e",
        name: "Message 1",
        variant: {
          type: ChannelType.Email,
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
        name: "Message 2",
        child: JourneyNodeType.ExitNode,
        variant: {
          type: ChannelType.Email,
          templateId: expect.any(String),
        },
      },
    ];
    expect(nodes).toEqual(expect.arrayContaining(expectedNodes));
    expect(nodes).toHaveLength(expectedNodes.length);
  });
});
