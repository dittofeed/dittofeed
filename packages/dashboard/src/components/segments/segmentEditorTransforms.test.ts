import {
  InternalEventType,
  RelationalOperators,
  SegmentDefinition,
  SegmentNodeType,
  SegmentOperatorType,
} from "isomorphic-lib/src/types";

import {
  EDITOR_SEGMENT_NODE_TYPE,
  fromEditorDefinition,
  toEditorDefinition,
} from "./segmentEditorTransforms";

describe("segmentEditorTransforms", () => {
  it("collapses a journey node processed performed node", () => {
    const definition = {
      entryNode: {
        type: SegmentNodeType.Performed as const,
        id: "entry",
        event: InternalEventType.JourneyNodeProcessed,
        times: 1,
        timesOperator: RelationalOperators.GreaterThanOrEqual as const,
        properties: [
          {
            path: "journeyId",
            operator: {
              type: SegmentOperatorType.Equals as const,
              value: "journey-1",
            },
          },
          {
            path: "nodeId",
            operator: {
              type: SegmentOperatorType.Equals as const,
              value: "node-1",
            },
          },
        ],
      },
      nodes: [],
    } satisfies SegmentDefinition;

    const editorDefinition = toEditorDefinition(definition);

    expect(editorDefinition.entryNode).toEqual({
      type: EDITOR_SEGMENT_NODE_TYPE.UserPerformedJourney,
      id: "entry",
      journeyId: "journey-1",
      nodeId: "node-1",
      times: 1,
      timesOperator: RelationalOperators.GreaterThanOrEqual,
    });
  });

  it("does not collapse an OR of journey node processed performed nodes", () => {
    const definition = {
      entryNode: {
        type: SegmentNodeType.Or as const,
        id: "entry",
        children: ["performed-1", "performed-2"],
      },
      nodes: [
        {
          type: SegmentNodeType.Performed as const,
          id: "performed-1",
          event: InternalEventType.JourneyNodeProcessed,
          times: 1,
          timesOperator: RelationalOperators.GreaterThanOrEqual as const,
          properties: [
            {
              path: "journeyId",
              operator: {
                type: SegmentOperatorType.Equals as const,
                value: "journey-1",
              },
            },
            {
              path: "nodeId",
              operator: {
                type: SegmentOperatorType.Equals as const,
                value: "node-1",
              },
            },
          ],
        },
        {
          type: SegmentNodeType.Performed as const,
          id: "performed-2",
          event: InternalEventType.JourneyNodeProcessed,
          times: 1,
          timesOperator: RelationalOperators.GreaterThanOrEqual as const,
          properties: [
            {
              path: "journeyId",
              operator: {
                type: SegmentOperatorType.Equals as const,
                value: "journey-1",
              },
            },
            {
              path: "nodeId",
              operator: {
                type: SegmentOperatorType.Equals as const,
                value: "node-2",
              },
            },
          ],
        },
      ],
    } satisfies SegmentDefinition;

    const editorDefinition = toEditorDefinition(definition);

    expect(editorDefinition.entryNode).toEqual(definition.entryNode);
    expect(editorDefinition.nodes).toEqual([
      {
        type: EDITOR_SEGMENT_NODE_TYPE.UserPerformedJourney,
        id: "performed-1",
        journeyId: "journey-1",
        nodeId: "node-1",
        times: 1,
        timesOperator: RelationalOperators.GreaterThanOrEqual,
      },
      {
        type: EDITOR_SEGMENT_NODE_TYPE.UserPerformedJourney,
        id: "performed-2",
        journeyId: "journey-1",
        nodeId: "node-2",
        times: 1,
        timesOperator: RelationalOperators.GreaterThanOrEqual,
      },
    ]);
  });

  it("expands a user performed journey node back to performed", () => {
    const editorDefinition = {
      entryNode: {
        type: EDITOR_SEGMENT_NODE_TYPE.UserPerformedJourney,
        id: "entry",
        journeyId: "journey-1",
        nodeId: "node-1",
        times: 1,
        timesOperator: RelationalOperators.GreaterThanOrEqual,
      },
      nodes: [],
    };

    expect(fromEditorDefinition(editorDefinition)).toEqual({
      entryNode: {
        type: SegmentNodeType.Performed,
        id: "entry",
        event: InternalEventType.JourneyNodeProcessed,
        times: 1,
        timesOperator: RelationalOperators.GreaterThanOrEqual,
        properties: [
          {
            path: "journeyId",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "journey-1",
            },
          },
          {
            path: "nodeId",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "node-1",
            },
          },
        ],
      },
      nodes: [],
    });
  });

  it("round trips a collapsed performed node", () => {
    const original = {
      entryNode: {
        type: SegmentNodeType.Performed as const,
        id: "entry",
        event: InternalEventType.JourneyNodeProcessed,
        times: 1,
        timesOperator: RelationalOperators.GreaterThanOrEqual as const,
        properties: [
          {
            path: "journeyId",
            operator: {
              type: SegmentOperatorType.Equals as const,
              value: "journey-1",
            },
          },
          {
            path: "nodeId",
            operator: {
              type: SegmentOperatorType.Equals as const,
              value: "node-1",
            },
          },
        ],
      },
      nodes: [],
    } satisfies SegmentDefinition;

    expect(fromEditorDefinition(toEditorDefinition(original))).toEqual(original);
  });
});
