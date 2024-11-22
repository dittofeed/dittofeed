import { EdgeProps, getBezierPath } from "@xyflow/react";
import React from "react";

import styles from "./edgeTypes.module.css";

// the placeholder edges do not have a special functionality, only used as a visual
export default function PlaceholderEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    curvature: 1,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <path id={id} style={style} className={styles.edgePath} d={edgePath} />
  );
}
