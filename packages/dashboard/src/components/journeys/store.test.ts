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
import { Overwrite } from "utility-types";
import { v4 as uuid } from "uuid";

import {
  AdditionalJourneyNodeType,
  JourneyState,
  JourneyStateForResource,
  JourneyUiEdgeType,
  JourneyUiNodeType,
} from "../../lib/types";
import {
  findDirectUiChildren,
  findDirectUiParents,
  journeyDefinitionFromState,
  journeyToState,
} from "./store";

const EXAMPLE_JOURNEY_STATE: JourneyState = {
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
      id: AdditionalJourneyNodeType.EntryUiNode,
      data: {
        type: JourneyUiNodeType.JourneyUiNodeDefinitionProps,
        nodeTypeProps: {
          type: AdditionalJourneyNodeType.EntryUiNode,
          variant: {
            type: JourneyNodeType.SegmentEntryNode,
            segment: "segment-id-1",
          },
        },
      },
      position: { x: 400, y: 100 },
      type: "journey",
      width: 300,
      height: 90,
      selected: false,
    },
    {
      id: "message-node-1",
      data: {
        type: JourneyUiNodeType.JourneyUiNodeDefinitionProps,
        nodeTypeProps: {
          type: JourneyNodeType.MessageNode,
          name: "Message 1",
          channel: ChannelType.Email,
          templateId: "template-id-1",
        },
      },
      position: { x: 400, y: 300 },
      type: "journey",
      width: 300,
      height: 90,
    },
    {
      id: "delay-node-1",
      data: {
        type: JourneyUiNodeType.JourneyUiNodeDefinitionProps,
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
      id: "segment-split-node-1",
      data: {
        type: JourneyUiNodeType.JourneyUiNodeDefinitionProps,
        nodeTypeProps: {
          type: JourneyNodeType.SegmentSplitNode,
          segmentId: "segment-id-2",
          name: "True / False Branch",
          trueLabelNodeId: "true-label-node",
          falseLabelNodeId: "false-label-node",
        },
      },
      position: { x: 400, y: 700 },
      type: "journey",
      width: 300,
      height: 90,
    },
    {
      id: "true-label-node",
      data: {
        type: JourneyUiNodeType.JourneyUiNodeLabelProps,
        title: "true",
      },
      position: { x: 200, y: 900 },
      type: "label",
      width: 44,
      height: 38,
    },
    {
      id: "message-node-2",
      data: {
        type: JourneyUiNodeType.JourneyUiNodeDefinitionProps,
        nodeTypeProps: {
          type: JourneyNodeType.MessageNode,
          channel: ChannelType.Email,
          name: "Message 2",
          templateId: "template-id-2",
        },
      },
      position: { x: 200, y: 1100 },
      type: "journey",
      width: 300,
      height: 90,
    },
    {
      id: "empty-node-1", // Human-readable ID
      data: { type: JourneyUiNodeType.JourneyUiNodeEmptyProps },
      position: { x: 400, y: 1300 },
      type: "empty",
      width: 8,
      height: 8,
    },
    {
      id: JourneyNodeType.ExitNode,
      data: {
        type: JourneyUiNodeType.JourneyUiNodeDefinitionProps,
        nodeTypeProps: { type: JourneyNodeType.ExitNode },
      },
      position: { x: 400, y: 1500 },
      type: "journey",
      width: 300,
      height: 60,
    },
    {
      id: "false-label-node", // Human-readable ID
      data: {
        type: JourneyUiNodeType.JourneyUiNodeLabelProps,
        title: "false",
      },
      position: { x: 600, y: 900 },
      type: "label",
      width: 49,
      height: 38,
    },
  ],
  journeyEdges: [
    // Edges now use the new human-readable node IDs
    {
      id: `${AdditionalJourneyNodeType.EntryUiNode}->message-node-1`,
      source: AdditionalJourneyNodeType.EntryUiNode,
      target: "message-node-1",
      type: "workflow",
    },
    {
      id: "message-node-1->delay-node-1",
      source: "message-node-1",
      target: "delay-node-1",
      type: "workflow",
    },
    {
      id: "delay-node-1->segment-split-node-1",
      source: "delay-node-1",
      target: "segment-split-node-1",
      type: "workflow",
    },
    {
      id: "segment-split-node-1->true-label-node",
      source: "segment-split-node-1",
      target: "true-label-node",
      type: "placeholder",
    },
    {
      id: "segment-split-node-1->false-label-node",
      source: "segment-split-node-1",
      target: "false-label-node",
      type: "placeholder",
    },
    {
      id: "false-label-node->empty-node-1",
      source: "false-label-node",
      target: "empty-node-1",
      type: "workflow",
      data: {
        type: JourneyUiEdgeType.JourneyUiDefinitionEdgeProps,
        disableMarker: true,
      },
    },
    {
      id: `empty-node-1->${JourneyNodeType.ExitNode}`,
      source: "empty-node-1",
      target: JourneyNodeType.ExitNode,
      type: "workflow",
    },
    {
      id: "message-node-2->empty-node-1",
      source: "message-node-2",
      target: "empty-node-1",
      type: "workflow",
    },
    {
      id: "true-label-node->message-node-2",
      source: "true-label-node",
      target: "message-node-2",
      type: "workflow",
    },
  ],
  journeyNodesIndex: {
    [AdditionalJourneyNodeType.EntryUiNode]: 0,
    "message-node-1": 1,
    "delay-node-1": 2,
    "segment-split-node-1": 3,
    "true-label-node": 4,
    "message-node-2": 5,
    "empty-node-1": 6,
    [JourneyNodeType.ExitNode]: 7,
    "false-label-node": 8,
  },
  journeyDraggedComponentType: null,
  journeyName: "My Journey",
};

describe("journeyToState", () => {
  let journeyResource: Overwrite<
    JourneyResource,
    { definition: JourneyDefinition }
  >;
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
          type: JourneyNodeType.SegmentEntryNode,
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
        updatedAt: Number(new Date()),
      };

      journeyId = uuid();
      workspaceId = uuid();
      journeyResource = {
        id: journeyId,
        name: "My Journey",
        status: "NotStarted",
        definition,
        workspaceId,
        updatedAt: Number(new Date()),
      };
      uiState = journeyToState(journeyResource);
    });

    const uiExpectations: [string, string[]][] = [
      [JourneyNodeType.SegmentEntryNode, ["segment-split-1"]],
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
          type: JourneyNodeType.SegmentEntryNode,
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
        updatedAt: Number(new Date()),
      };
      uiState = journeyToState(journeyResource);
    });

    it("produces the right ui state", async () => {
      const uiExpectations: [string, string[]][] = [
        [JourneyNodeType.SegmentEntryNode, ["segment-split"]],
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
        [JourneyNodeType.SegmentEntryNode, ["segment-split"]],
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
          type: JourneyNodeType.SegmentEntryNode,
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
        updatedAt: Number(new Date()),
      };
      uiState = journeyToState(journeyResource);

      definitionFromState = unwrap(
        await journeyDefinitionFromState({ state: uiState }),
      );
    });
    const uiExpectations: [string, string[]][] = [
      [JourneyNodeType.SegmentEntryNode, ["wait-for-first-deployment-1"]],
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
      [JourneyNodeType.SegmentEntryNode, ["wait-for-first-deployment-1"]],
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
          node.id === AdditionalJourneyNodeType.EntryUiNode ||
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
            type: JourneyNodeType.SegmentEntryNode,
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
        updatedAt: Number(new Date()),
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
        [JourneyNodeType.SegmentEntryNode, ["message-1"]],
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
            type: JourneyNodeType.SegmentEntryNode,
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
        updatedAt: Number(new Date()),
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
  it("returns a journey definition", () => {
    const result = journeyDefinitionFromState({
      state: EXAMPLE_JOURNEY_STATE,
    });
    if (result.isErr()) {
      throw new Error(
        `journeyResourceFromState failed with ${result.error.message}`,
      );
    }
    const { exitNode, entryNode, nodes } = result.value;
    expect(entryNode).toEqual({
      type: JourneyNodeType.SegmentEntryNode,
      segment: expect.any(String),
      child: "message-node-1",
    });
    expect(exitNode).toEqual({
      type: JourneyNodeType.ExitNode,
    });

    const expectedNodes = [
      {
        id: "message-node-1",
        type: JourneyNodeType.MessageNode,
        child: "delay-node-1",
        name: "Message 1",
        variant: {
          type: ChannelType.Email,
          templateId: expect.any(String),
        },
      },
      {
        id: "delay-node-1",
        type: JourneyNodeType.DelayNode,
        child: "segment-split-node-1",
        variant: {
          type: "Second",
          seconds: 1800,
        },
      },
      {
        id: "segment-split-node-1",
        type: JourneyNodeType.SegmentSplitNode,
        variant: {
          type: SegmentSplitVariantType.Boolean,
          segment: expect.any(String),
          trueChild: "message-node-2",
          falseChild: JourneyNodeType.ExitNode,
        },
      },
      {
        id: "message-node-2",
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
