import { Box } from "@mui/material";
import { EdgeLabelRenderer, EdgeProps, getBezierPath } from "@xyflow/react";
import { round } from "isomorphic-lib/src/numbers";
import { NodeStatsType } from "isomorphic-lib/src/types";
import { useRouter } from "next/router";
import React, { useState } from "react";

import { useAppStore, useAppStorePick } from "../../../lib/appStore";
import { JourneyUiEdge } from "../../../lib/types";
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
}: EdgeProps<JourneyUiEdge>) {
  const path = useRouter();

  const { journeyStats, journeyDraggedComponentType } = useAppStorePick([
    "journeyStats",
    "journeyDraggedComponentType",
  ]);

  const isDragging = !!journeyDraggedComponentType;
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
        return `${round(100 - stats.proportions.falseChildEdge, 1).toString()} % (${(round((100 - stats.proportions.falseChildEdge) / 100 * stats.count, 0)).toLocaleString()})`;
      }
      if (id.includes("child-1")) {
        return `${stats.proportions.falseChildEdge.toString()} % (${round(stats.proportions.falseChildEdge / 100 * stats.count, 0).toLocaleString()})`;
      }
    }

    if (stats?.type === NodeStatsType.WaitForNodeStats) {
      if (id.includes("child-0")) {
        return `${stats.proportions.segmentChildEdge.toString()} % (${round(stats.proportions.segmentChildEdge / 100 * stats.count, 0).toLocaleString()})`;
      }
      if (id.includes("child-1")) {
        return `${round(100 - stats.proportions.segmentChildEdge, 1).toString()} % (${round((100 - stats.proportions.segmentChildEdge) / 100 * stats.count, 0).toLocaleString()})`;
      }
    }

    if (
      stats?.type === NodeStatsType.DelayNodeStats ||
      stats?.type === NodeStatsType.MessageNodeStats
    ) {
      return `${stats.proportions.childEdge.toString()} % (${stats.count.toLocaleString()})`;
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
      {getLabelText().length > 0 && (
        <EdgeLabelRenderer>
          <Box
            sx={{
              width: 60,
              height: 60,
              transform: `translate(${edgeCenterX - 30}px,${edgeCenterY - 30}px)`,
              position: "absolute",
              opacity: isDragging ? 0 : undefined,
              transition: "opacity 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            className="nodrag nopan journey-percent"
          >
            <Box
              sx={{
                fontWeight: 700,
                fontSize: 12,
                padding: 1,
                backgroundColor: "#f0f0f0",
              }}
            >
              {getLabelText()}
            </Box>
          </Box>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
