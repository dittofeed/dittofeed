import { BodySegmentNode, SegmentNode, SegmentNodeType } from "./types";

export function isBodySegmentNode(node: SegmentNode): node is BodySegmentNode {
  return node.type !== SegmentNodeType.Manual;
}
