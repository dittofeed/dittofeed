import {
  ClockCircleOutlined,
  FontSizeOutlined,
  ForkOutlined,
  MailOutlined,
} from "@ant-design/icons";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { JourneyNodeType } from "isomorphic-lib/src/types";
import React from "react";

import { useAppStore } from "../../lib/appStore";
import journeyNodeLabel from "./journeyNodeLabel";

function Sidebar() {
  const theme = useTheme();
  const setDraggedComponentType = useAppStore(
    (store) => store.setDraggedComponentType
  );
  const onDragStart =
    ({ nodeType }: { nodeType: JourneyNodeType }) =>
    () => {
      setDraggedComponentType(nodeType);
    };

  const onDragEnd = () => {
    setDraggedComponentType(null);
  };

  const nodeTypes: [JourneyNodeType, typeof FontSizeOutlined][] = [
    [JourneyNodeType.DelayNode, ClockCircleOutlined],
    [JourneyNodeType.SegmentSplitNode, ForkOutlined],
    [JourneyNodeType.MessageNode, MailOutlined],
  ];

  const nodeTypesEls = nodeTypes.map(([t, Icon]) => (
    <Stack
      direction="row"
      onDragStart={onDragStart({ nodeType: t })}
      onDragEnd={onDragEnd}
      draggable
      sx={{
        cursor: "grab",
        borderRadius: 1,
        padding: 1,
        border: `1px solid ${theme.palette.grey[200]}`,
        ":active": {
          cursor: "grabbing",
        },
        ":hover": {
          boxShadow: "rgba(0, 0, 0, 0.533) 0px 0px 2px 0px",
        },
      }}
      key={t}
    >
      <Box sx={{ paddingRight: 1 }}>
        <Icon />
      </Box>
      {journeyNodeLabel(t)}
    </Stack>
  ));

  return (
    <Box
      sx={{
        backgroundColor: "white",
        border: `1px solid ${theme.palette.grey[200]}`,
        width: 270,
        padding: 2,
      }}
    >
      <Stack spacing={1}>
        <Typography
          variant="h5"
          sx={{ fontSize: theme.typography.h6.fontSize, userSelect: "none" }}
        >
          Journey Node Palette
        </Typography>
        {nodeTypesEls}
      </Stack>
    </Box>
  );
}

export default Sidebar;
