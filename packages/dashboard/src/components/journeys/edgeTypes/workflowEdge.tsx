import React, { useState } from "react";
import { EdgeProps, getBezierPath } from "reactflow";

import { useAppStore } from "../../../lib/appStore";
import { EdgeData } from "../../../lib/types";
import findNode from "../findNode";
import styles from "./edgeTypes.module.css";

export default function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  source,
  target,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps<EdgeData>) {
  const [isDropzoneActive, setDropzoneActive] = useState<boolean>(false);
  const isDragging = useAppStore(
    (store) => !!store.journeyDraggedComponentType,
  );

  const onDrop = () => {
    setDropzoneActive(false);
  };

  const onDragEnter = () => {
    setDropzoneActive(true);
  };

  const onDragLeave = () => {
    setDropzoneActive(false);
  };

  const [edgePath, edgeCenterX, edgeCenterY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const nodes = useAppStore((state) => state.journeyNodes);
  const nodesIndex = useAppStore((state) => state.journeyNodesIndex);
  const targetNode = findNode(target, nodes, nodesIndex);
  if (targetNode && targetNode.type === "empty") {
    markerEnd = undefined;
  }

  const isPlusVisible = isDragging && !isDropzoneActive;
  return (
    <>
      <path
        id={id}
        style={style}
        className={styles.edgePath}
        d={edgePath}
        markerEnd={markerEnd}
      />
      <g transform={`translate(${edgeCenterX}, ${edgeCenterY})`}>
        <line
          x1="-80"
          y1="0"
          x2="80"
          y2="0"
          strokeWidth={160}
          onDrop={onDrop}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          data-source={source}
          data-target={target}
        />
        <rect
          x={-80}
          y={-39}
          width={160}
          ry={4}
          rx={4}
          height={78}
          className={styles.nodeDropzone}
          opacity={isDropzoneActive ? 1 : 0}
        />
        <rect
          x={-10}
          y={-10}
          width={20}
          ry={4}
          rx={4}
          height={20}
          className={styles.edgeTextContainer}
          display={isPlusVisible ? undefined : "none"}
        />
        <text
          className={styles.addNodeText}
          y={5}
          x={-4}
          display={isPlusVisible ? undefined : "none"}
        >
          +
        </text>
      </g>
    </>
  );
}
