import { Box, Stack, Typography, useTheme } from "@mui/material";
import { JourneyNodeType } from "isomorphic-lib/src/types";
import React, { useMemo } from "react";

import { useAppStore, useAppStorePick } from "../../lib/appStore";
import { AdditionalJourneyNodeType, NodeTypeProps } from "../../lib/types";
import journeyNodeLabel from "./journeyNodeLabel";
import { JourneyNodeIcon, journeyNodeIcon } from "./nodeTypes/journeyNode";
import { GlobalJourneyErrorType, getGlobalJourneyErrors } from "./globalJourneyErrors";

const SIDEBAR_NODE_TYPES: NodeTypeProps["type"][] = [
  JourneyNodeType.DelayNode,
  JourneyNodeType.SegmentSplitNode,
  JourneyNodeType.MessageNode,
  JourneyNodeType.WaitForNode,
];

function Sidebar() {
  const theme = useTheme();
  const { setDraggedComponentType, journeyNodes } = useAppStorePick([
    'setDraggedComponentType',
    'journeyNodes'
  ]);

  const isEventEntry = useMemo(
    () =>
      journeyNodes.find(
        (n) =>
          n.data.type === "JourneyNode" &&
          n.data.nodeTypeProps.type === AdditionalJourneyNodeType.UiEntryNode &&
          n.data.nodeTypeProps.variant.type === JourneyNodeType.EventEntryNode,
      ),
    [journeyNodes],
  );

  const onDragStart =
    ({ nodeType }: { nodeType: NodeTypeProps["type"] }) =>
    () => {
      setDraggedComponentType(nodeType);
    };

  const onDragEnd = () => {
    setDraggedComponentType(null);
  };

  const nodeTypes: [NodeTypeProps["type"], JourneyNodeIcon][] =
    SIDEBAR_NODE_TYPES.map((t) => [t, journeyNodeIcon(t)]);

  const nodeTypesEls = nodeTypes.map(([t, Icon]) => {
    const isDisabled = isEventEntry && t === JourneyNodeType.WaitForNode;

    return (
      <Stack
        direction="row"
        onDragStart={onDragStart({ nodeType: t })}
        onDragEnd={onDragEnd}
        draggable
        sx={{
          cursor: isDisabled ? "default" : "grab",
          color: isDisabled ? theme.palette.grey[500] : "inherit",
          borderRadius: 1,
          backgroundColor: isDisabled ? theme.palette.grey[300] : "inherit",
          padding: 1,
          pointerEvents: isDisabled ? "none" : "auto",
          border: `1px solid ${theme.palette.grey[200]}`,
          ":active": {
            cursor: isDisabled ? "default" : "grabbing",
          },
          ":hover": {
            boxShadow: isDisabled ? "none" : "rgba(0, 0, 0, 0.533) 0px 0px 2px 0px",
          },
        }}
        key={t}
      >
        <Box sx={{ paddingRight: 1 }}>
          <Icon />
        </Box>
        {journeyNodeLabel(t)}
      </Stack>
  )});

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
