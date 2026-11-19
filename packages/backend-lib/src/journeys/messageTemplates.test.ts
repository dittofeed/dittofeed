import { getMessageTemplates } from "isomorphic-lib/src/journeys";
import {
  ChannelType,
  JourneyDefinition,
  JourneyNodeType,
} from "isomorphic-lib/src/types";

describe("getMessageTemplates", () => {
  it("collects the base variant of a message node", () => {
    const definition: JourneyDefinition = {
      entryNode: {
        type: JourneyNodeType.EventEntryNode,
        event: "test",
        child: "message-node",
      },
      nodes: [
        {
          id: "message-node",
          type: JourneyNodeType.MessageNode,
          variant: {
            type: ChannelType.Email,
            templateId: "baseline-template",
          },
          child: "exit-node",
        },
      ],
      exitNode: { type: JourneyNodeType.ExitNode },
    };

    expect(getMessageTemplates(definition)).toEqual(
      new Set(["baseline-template"]),
    );
  });

  it("collects every arm of a message A/B test", () => {
    const definition: JourneyDefinition = {
      entryNode: {
        type: JourneyNodeType.EventEntryNode,
        event: "test",
        child: "message-node",
      },
      nodes: [
        {
          id: "message-node",
          type: JourneyNodeType.MessageNode,
          variant: {
            type: ChannelType.Email,
            templateId: "baseline-template",
          },
          variants: [
            {
              id: "arm-a",
              name: "Control",
              weight: 1,
              variant: {
                type: ChannelType.Email,
                templateId: "arm-a-template",
              },
            },
            {
              id: "arm-b",
              name: "Variant",
              weight: 1,
              variant: {
                type: ChannelType.Email,
                templateId: "arm-b-template",
              },
            },
          ],
          child: "exit-node",
        },
      ],
      exitNode: { type: JourneyNodeType.ExitNode },
    };

    expect(getMessageTemplates(definition)).toEqual(
      new Set(["baseline-template", "arm-a-template", "arm-b-template"]),
    );
  });
});
