import { Box, useTheme } from "@mui/material";
import { Handle, NodeProps, Position } from "reactflow";

import { JourneyUiNodeLabelProps } from "../../../lib/types";
import styles from "./nodeTypes.module.css";

function LabelNode({ data }: NodeProps<JourneyUiNodeLabelProps>) {
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
        sx={{ p: 1, backgroundColor: theme.palette.grey[200], borderRadius: 1 }}
      >
        {data.title}
      </Box>
      <Handle
        type="source"
        id="bottom"
        position={Position.Bottom}
        className={styles.handle}
      />
    </>
  );
}

export default LabelNode;
