import { Box, useTheme } from "@mui/material";
import { Handle, Position } from "@xyflow/react";

import styles from "./nodeTypes.module.css";

export function EmptyNode() {
  const theme = useTheme();
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className={styles.handle}
        id="top"
      />
      <Box
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: theme.palette.grey[400],
        }}
      />
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className={styles.handle}
      />
    </>
  );
}
