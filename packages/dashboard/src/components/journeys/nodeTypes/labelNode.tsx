import { Box, useTheme } from "@mui/material";
import { Handle, NodeProps, Position } from "reactflow";

import { LabelNodeProps } from "../../../lib/types";
import styles from "./nodeTypes.module.css";

function LabelNode({ data }: NodeProps<LabelNodeProps>) {
  const theme = useTheme();
  return (
    <>
      <Handle type="target" position={Position.Top} className={styles.handle} />
      <Box
        sx={{ p: 1, backgroundColor: theme.palette.grey[200], borderRadius: 1 }}
      >
        {data.title}
      </Box>
      <Handle
        type="source"
        position={Position.Bottom}
        className={styles.handle}
      />
    </>
  );
}

export default LabelNode;
