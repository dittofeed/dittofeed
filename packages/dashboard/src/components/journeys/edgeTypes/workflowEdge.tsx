import { FeatureNamesEnum, NodeStatsType } from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import React, { useState } from "react";
import { EdgeLabelRenderer, EdgeProps, getBezierPath } from "reactflow";

import { useAppStore, useAppStorePick } from "../../../lib/appStore";
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
  const path = useRouter();

  const { journeyStats, journeyDraggedComponentType, features } =
    useAppStorePick([
      "journeyStats",
      "journeyDraggedComponentType",
      "features",
    ]);

  const isDragging = !!journeyDraggedComponentType;
  const isDisplayJourneyPercentagesEnabled =
    !!features[FeatureNamesEnum.DisplayJourneyPercentages];
  const [isDropzoneActive, setDropzoneActive] = useState<boolean>(false);

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

  let sourceWithoutChildSuffix = source;
  sourceWithoutChildSuffix = sourceWithoutChildSuffix.replaceAll(
    "-child-0",
    "",
  );
  sourceWithoutChildSuffix = sourceWithoutChildSuffix.replaceAll(
    "-child-1",
    "",
  );

  const journeyId = typeof path.query.id === "string" ? path.query.id : "";
  const stats = journeyStats[journeyId]?.nodeStats[sourceWithoutChildSuffix];

  if (targetNode && targetNode.type === "empty") {
    markerEnd = undefined;
  }

  const isPlusVisible = isDragging && !isDropzoneActive;

  const getLabelText = (): string => {
    if (stats?.type === NodeStatsType.SegmentSplitNodeStats) {
      if (id.includes("child-0")) {
        return (100 - stats.proportions.falseChildEdge).toString();
      }
      if (id.includes("child-1")) {
        return stats.proportions.falseChildEdge.toString();
      }
    }

    if (stats?.type === NodeStatsType.WaitForNodeStats) {
      if (id.includes("child-0")) {
        return stats.proportions.segmentChildEdge.toString();
      }
      if (id.includes("child-1")) {
        return (100 - stats.proportions.segmentChildEdge).toString();
      }
    }

    if (
      stats?.type === NodeStatsType.DelayNodeStats ||
      stats?.type === NodeStatsType.MessageNodeStats
    ) {
      return stats.proportions.childEdge.toString();
    }

    return "";
  };

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
      {isDisplayJourneyPercentagesEnabled && getLabelText().length > 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${edgeCenterX}px,${edgeCenterY - 40}px)`,
              fontSize: 12,
              fontWeight: 700,
              padding: "8px",
              backgroundColor: "#f0f0f0",
            }}
            className="nodrag nopan"
          >
            {`${getLabelText()} %`}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
