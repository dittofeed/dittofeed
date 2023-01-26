import { NodeTypes } from "reactflow";

import { EmptyNode } from "./emptyNode";
import { JourneyNode } from "./journeyNode";
import LabelNode from "./labelNode";

// two different node types are needed for our example: workflow and placeholder nodes
const nodeTypes: NodeTypes = {
  journey: JourneyNode,
  label: LabelNode,
  empty: EmptyNode,
};

export default nodeTypes;
