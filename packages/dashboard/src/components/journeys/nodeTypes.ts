import { NodeTypes } from "@xyflow/react";

import { EmptyNode } from "./nodeTypes/emptyNode";
import { JourneyNode } from "./nodeTypes/journeyNode";
import LabelNode from "./nodeTypes/labelNode";

// two different node types are needed for our example: workflow and placeholder nodes
const nodeTypes: NodeTypes = {
  journey: JourneyNode,
  label: LabelNode,
  empty: EmptyNode,
};

export default nodeTypes;
