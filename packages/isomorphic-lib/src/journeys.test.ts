import { findDirectChildren, removeNode } from "./journeys";
import {
  ChannelType,
  JourneyDefinition,
  JourneyNodeType,
  SegmentSplitVariantType,
} from "./types";

describe("removeNode", () => {
  let definition: JourneyDefinition;
  beforeEach(() => {
    definition = {
      entryNode: {
        type: JourneyNodeType.EntryNode,
        segment: "segment-1",
        child: "segment-split-1",
      },
      nodes: [
        {
          type: JourneyNodeType.SegmentSplitNode,
          id: "segment-split-1",
          variant: {
            segment: "segment-2",
            type: SegmentSplitVariantType.Boolean,
            trueChild: JourneyNodeType.ExitNode,
            falseChild: "message-1",
          },
        },
        {
          type: JourneyNodeType.MessageNode,
          id: "message-1",
          child: JourneyNodeType.ExitNode,
          variant: {
            type: ChannelType.Email,
            templateId: "template-1",
          },
        },
      ],
      exitNode: {
        type: JourneyNodeType.ExitNode,
      },
    };
  });

  test("removes a node", () => {
    const withRemoved = removeNode("segment-split-1", definition);
    expect(findDirectChildren(JourneyNodeType.EntryNode, withRemoved)).toEqual(
      new Set([JourneyNodeType.ExitNode])
    );
  });
});
