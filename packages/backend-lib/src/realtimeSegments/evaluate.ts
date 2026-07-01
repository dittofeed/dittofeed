import crypto from "crypto";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";

import { jsonValue } from "../jsonPath";
import {
  CursorDirectionEnum,
  InternalEventType,
  JSONValue,
  LastPerformedSegmentNode,
  PerformedSegmentNode,
  RelationalOperators,
  SavedSegmentResource,
  SegmentNode,
  SegmentNodeType,
  SegmentOperator,
  SegmentOperatorType,
  SubscriptionChange,
  SubscriptionGroupType,
  TimeOperator,
} from "../types";
import { RealtimeUserState, RealtimeUserTrackEvent } from "./state";

export interface RealtimeSegmentEvaluation {
  inSegment: boolean;
  unsupportedNodes: string[];
}

type EvaluationResult =
  | {
      supported: true;
      value: boolean;
    }
  | {
      supported: false;
      nodeId: string;
      reason: string;
    };

function unsupported(node: SegmentNode, reason: string): EvaluationResult {
  return {
    supported: false,
    nodeId: node.id,
    reason,
  };
}

function isPresent(value: JSONValue | undefined): boolean {
  return value !== undefined && value !== null && value !== "";
}

function toNumber(value: JSONValue | undefined): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toStringValue(value: JSONValue | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function evaluateTimestamp({
  value,
  operator,
  now,
}: {
  value: JSONValue | undefined;
  operator: SegmentOperator;
  now: Date;
}): boolean | null {
  const timestamp = new Date(toStringValue(value)).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  switch (operator.type) {
    case SegmentOperatorType.Within:
      return timestamp >= now.getTime() - operator.windowSeconds * 1000;
    case SegmentOperatorType.NotWithin:
      return timestamp < now.getTime() - operator.windowSeconds * 1000;
    case SegmentOperatorType.AbsoluteTimestamp: {
      const absoluteTimestamp = new Date(operator.absoluteTimestamp).getTime();
      if (Number.isNaN(absoluteTimestamp)) {
        return null;
      }
      return operator.direction === CursorDirectionEnum.After
        ? timestamp >= absoluteTimestamp
        : timestamp < absoluteTimestamp;
    }
    default:
      return null;
  }
}

function evaluateOperator({
  value,
  operator,
  now,
}: {
  value: JSONValue | undefined;
  operator: SegmentOperator;
  now: Date;
}): boolean | null {
  switch (operator.type) {
    case SegmentOperatorType.Equals:
      return toStringValue(value) === String(operator.value);
    case SegmentOperatorType.NotEquals:
      return toStringValue(value) !== String(operator.value);
    case SegmentOperatorType.GreaterThanOrEqual: {
      const numeric = toNumber(value);
      return numeric === null ? false : numeric >= operator.value;
    }
    case SegmentOperatorType.LessThan: {
      const numeric = toNumber(value);
      return numeric === null ? false : numeric < operator.value;
    }
    case SegmentOperatorType.Exists:
      return isPresent(value);
    case SegmentOperatorType.NotExists:
      return !isPresent(value);
    case SegmentOperatorType.Within:
    case SegmentOperatorType.NotWithin:
    case SegmentOperatorType.AbsoluteTimestamp:
      return evaluateTimestamp({ value, operator, now });
    case SegmentOperatorType.HasBeen:
      return null;
    default:
      assertUnreachable(operator);
  }
}

function eventPropertyValue({
  event,
  path,
}: {
  event: RealtimeUserTrackEvent;
  path: string;
}): JSONValue | undefined {
  const value = jsonValue({ data: event.properties, path });
  return value.isOk() ? value.value : undefined;
}

function matchesProperties({
  event,
  properties,
  now,
}: {
  event: RealtimeUserTrackEvent;
  properties?: { path: string; operator: SegmentOperator }[];
  now: Date;
}): boolean {
  if (!properties?.length) {
    return true;
  }
  return properties.every((property) => {
    const result = evaluateOperator({
      value: eventPropertyValue({ event, path: property.path }),
      operator: property.operator,
      now,
    });
    return result === true;
  });
}

function matchesPerformedTime({
  event,
  node,
  now,
}: {
  event: RealtimeUserTrackEvent;
  node: PerformedSegmentNode;
  now: Date;
}): boolean {
  if (!node.timeOperator) {
    return true;
  }
  const timestamp = event.eventTime.getTime();
  switch (node.timeOperator) {
    case TimeOperator.Within:
      return timestamp >= now.getTime() - (node.withinSeconds ?? 0) * 1000;
    case TimeOperator.AfterAbsolute:
      return timestamp >= new Date(node.absoluteTimestamp ?? 0).getTime();
    case TimeOperator.BeforeAbsolute:
      return timestamp < new Date(node.absoluteTimestamp ?? 0).getTime();
    default:
      assertUnreachable(node.timeOperator);
  }
}

function evaluateRelationalOperator({
  value,
  target,
  operator,
}: {
  value: number;
  target: number;
  operator?: RelationalOperators;
}): boolean {
  switch (operator ?? RelationalOperators.Equals) {
    case RelationalOperators.Equals:
      return value === target;
    case RelationalOperators.GreaterThanOrEqual:
      return value >= target;
    case RelationalOperators.LessThan:
      return value < target;
  }
}

function emailSegmentToPerformed(
  node: SegmentNode,
): PerformedSegmentNode | null {
  if (node.type !== SegmentNodeType.Email) {
    return null;
  }
  return {
    id: node.id,
    type: SegmentNodeType.Performed,
    event: node.event,
    times: node.times,
    timesOperator: RelationalOperators.GreaterThanOrEqual,
    properties: [
      {
        path: "templateId",
        operator: {
          type: SegmentOperatorType.Equals,
          value: node.templateId,
        },
      },
    ],
  };
}

function manualSegmentToLastPerformed({
  node,
  segment,
}: {
  node: SegmentNode;
  segment: SavedSegmentResource;
}): LastPerformedSegmentNode | null {
  if (node.type !== SegmentNodeType.Manual) {
    return null;
  }
  return {
    id: node.id,
    type: SegmentNodeType.LastPerformed,
    event: InternalEventType.ManualSegmentUpdate,
    whereProperties: [
      {
        path: "segmentId",
        operator: { type: SegmentOperatorType.Equals, value: segment.id },
      },
      {
        path: "version",
        operator: { type: SegmentOperatorType.Equals, value: node.version },
      },
    ],
    hasProperties: [
      {
        path: "inSegment",
        operator: { type: SegmentOperatorType.Equals, value: 1 },
      },
    ],
  };
}

function subscriptionSegmentToLastPerformed(
  node: SegmentNode,
): LastPerformedSegmentNode | null {
  if (node.type === SegmentNodeType.SubscriptionGroupUnsubscribed) {
    return {
      id: node.id,
      type: SegmentNodeType.LastPerformed,
      event: InternalEventType.SubscriptionChange,
      whereProperties: [
        {
          path: "subscriptionId",
          operator: {
            type: SegmentOperatorType.Equals,
            value: node.subscriptionGroupId,
          },
        },
      ],
      hasProperties: [
        {
          path: "action",
          operator: {
            type: SegmentOperatorType.Equals,
            value: SubscriptionChange.Unsubscribe,
          },
        },
      ],
    };
  }
  if (node.type !== SegmentNodeType.SubscriptionGroup) {
    return null;
  }
  return {
    id: node.id,
    type: SegmentNodeType.LastPerformed,
    event: InternalEventType.SubscriptionChange,
    whereProperties: [
      {
        path: "subscriptionId",
        operator: {
          type: SegmentOperatorType.Equals,
          value: node.subscriptionGroupId,
        },
      },
    ],
    hasProperties: [
      {
        path: "action",
        operator:
          node.subscriptionGroupType === SubscriptionGroupType.OptIn
            ? {
                type: SegmentOperatorType.Equals,
                value: SubscriptionChange.Subscribe,
              }
            : {
                type: SegmentOperatorType.NotEquals,
                value: SubscriptionChange.Unsubscribe,
              },
      },
    ],
  };
}

function evaluateNode({
  node,
  segment,
  state,
  nodeById,
  now,
}: {
  node: SegmentNode;
  segment: SavedSegmentResource;
  state: RealtimeUserState;
  nodeById: Map<string, SegmentNode>;
  now: Date;
}): EvaluationResult {
  switch (node.type) {
    case SegmentNodeType.Trait: {
      const result = evaluateOperator({
        value: state.traits[node.path],
        operator: node.operator,
        now,
      });
      return result === null
        ? unsupported(node, `unsupported trait operator ${node.operator.type}`)
        : { supported: true, value: result };
    }
    case SegmentNodeType.Includes: {
      const value = state.traits[node.path];
      return {
        supported: true,
        value:
          Array.isArray(value) &&
          value.some((item) => toStringValue(item) === node.item),
      };
    }
    case SegmentNodeType.NotIncludes: {
      const value = state.traits[node.path];
      return {
        supported: true,
        value:
          !Array.isArray(value) ||
          !value.some((item) => toStringValue(item) === node.item),
      };
    }
    case SegmentNodeType.And: {
      for (const childId of node.children) {
        const child = nodeById.get(childId);
        if (!child) {
          return unsupported(node, `missing child ${childId}`);
        }
        const childResult = evaluateNode({
          node: child,
          segment,
          state,
          nodeById,
          now,
        });
        if (!childResult.supported || !childResult.value) {
          return childResult;
        }
      }
      return { supported: true, value: true };
    }
    case SegmentNodeType.Or: {
      const unsupportedNodes: string[] = [];
      for (const childId of node.children) {
        const child = nodeById.get(childId);
        if (!child) {
          unsupportedNodes.push(`${node.id}:missing child ${childId}`);
          continue;
        }
        const childResult = evaluateNode({
          node: child,
          segment,
          state,
          nodeById,
          now,
        });
        if (childResult.supported && childResult.value) {
          return { supported: true, value: true };
        }
        if (!childResult.supported) {
          unsupportedNodes.push(`${childResult.nodeId}:${childResult.reason}`);
        }
      }
      return unsupportedNodes.length > 0
        ? unsupported(node, unsupportedNodes.join(","))
        : { supported: true, value: false };
    }
    case SegmentNodeType.Performed: {
      const count = state.trackEvents.filter(
        (event) =>
          event.event === node.event &&
          matchesPerformedTime({ event, node, now }) &&
          matchesProperties({ event, properties: node.properties, now }),
      ).length;
      return {
        supported: true,
        value: evaluateRelationalOperator({
          value: count,
          target: node.times ?? 1,
          operator: node.timesOperator,
        }),
      };
    }
    case SegmentNodeType.LastPerformed: {
      const latestEvent = state.trackEvents.find(
        (event) =>
          event.event === node.event &&
          matchesProperties({
            event,
            properties: node.whereProperties,
            now,
          }),
      );
      return {
        supported: true,
        value: latestEvent
          ? matchesProperties({
              event: latestEvent,
              properties: node.hasProperties,
              now,
            })
          : false,
      };
    }
    case SegmentNodeType.Email: {
      const performedNode = emailSegmentToPerformed(node);
      if (!performedNode) {
        return unsupported(node, "invalid email node");
      }
      return evaluateNode({
        node: performedNode,
        segment,
        state,
        nodeById,
        now,
      });
    }
    case SegmentNodeType.SubscriptionGroup:
    case SegmentNodeType.SubscriptionGroupUnsubscribed: {
      const lastPerformedNode = subscriptionSegmentToLastPerformed(node);
      if (!lastPerformedNode) {
        return unsupported(node, "invalid subscription node");
      }
      return evaluateNode({
        node: lastPerformedNode,
        segment,
        state,
        nodeById,
        now,
      });
    }
    case SegmentNodeType.Manual: {
      const lastPerformedNode = manualSegmentToLastPerformed({ node, segment });
      if (!lastPerformedNode) {
        return unsupported(node, "invalid manual node");
      }
      return evaluateNode({
        node: lastPerformedNode,
        segment,
        state,
        nodeById,
        now,
      });
    }
    case SegmentNodeType.Everyone:
      return { supported: true, value: true };
    case SegmentNodeType.RandomBucket: {
      const hash = crypto
        .createHash("md5")
        .update(`${state.userOrAnonymousId}${segment.name}`)
        .digest("hex")
        .slice(0, 16);
      const bucket = Number(BigInt(`0x${hash}`)) / 2 ** 64;
      return { supported: true, value: bucket < node.percent };
    }
    case SegmentNodeType.Broadcast:
    case SegmentNodeType.KeyedPerformed:
      return unsupported(node, `unsupported node type ${node.type}`);
    default:
      assertUnreachable(node);
  }
}

export function evaluateRealtimeSegment({
  segment,
  state,
  now = new Date(),
}: {
  segment: SavedSegmentResource;
  state: RealtimeUserState;
  now?: Date;
}): RealtimeSegmentEvaluation {
  const nodeById = new Map<string, SegmentNode>();
  nodeById.set(segment.definition.entryNode.id, segment.definition.entryNode);
  for (const node of segment.definition.nodes) {
    nodeById.set(node.id, node);
  }

  const result = evaluateNode({
    node: segment.definition.entryNode,
    segment,
    state,
    nodeById,
    now,
  });

  if (result.supported) {
    return { inSegment: result.value, unsupportedNodes: [] };
  }

  return {
    inSegment: false,
    unsupportedNodes: [`${result.nodeId}:${result.reason}`],
  };
}
