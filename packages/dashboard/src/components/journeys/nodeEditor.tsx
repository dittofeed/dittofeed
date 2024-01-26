import { CloseOutlined, Delete } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { SelectInputProps } from "@mui/material/Select/SelectInput";
import { MultiSectionDigitalClock } from "@mui/x-date-pickers/MultiSectionDigitalClock";
import { DAY_INDICES } from "isomorphic-lib/src/constants";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  AllowedDayIndices,
  ChannelType,
  CompletionStatus,
  DelayVariantType,
  JourneyNodeType,
  MessageTemplateResource,
  SegmentResource,
} from "isomorphic-lib/src/types";
import { ReactNode, useMemo } from "react";
import { Node } from "reactflow";
import { shallow } from "zustand/shallow";

import { useAppStore } from "../../lib/appStore";
import {
  DelayNodeProps,
  EntryNodeProps,
  JourneyNodeProps,
  MessageNodeProps,
  SegmentSplitNodeProps,
  WaitForNodeProps,
} from "../../lib/types";
import DurationSelect from "../durationSelect";
import { SubtleHeader } from "../headers";
import SubscriptionGroupAutocomplete from "../subscriptionGroupAutocomplete";
import findJourneyNode from "./findJourneyNode";
import journeyNodeLabel from "./journeyNodeLabel";
import { waitForTimeoutLabel } from "./store";

const width = 420;
const transitionDuration = ".15s";

function getSegmentLabel(tr: SegmentResource) {
  return tr.name;
}

function SegmentSplitNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: SegmentSplitNodeProps;
}) {
  const updateJourneyNodeData = useAppStore(
    (state) => state.updateJourneyNodeData,
  );

  const segments = useAppStore((state) => state.segments);

  const onSegmentChangeHandler = (
    _event: unknown,
    segment: SegmentResource | null,
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.SegmentSplitNode) {
        props.segmentId = segment?.id;
      }
    });
  };

  if (segments.type !== CompletionStatus.Successful) {
    return null;
  }

  const segment =
    segments.value.find((t) => t.id === nodeProps.segmentId) ?? null;

  return (
    <Autocomplete
      value={segment}
      options={segments.value}
      getOptionLabel={getSegmentLabel}
      onChange={onSegmentChangeHandler}
      renderInput={(params) => (
        <TextField {...params} label="segment" variant="outlined" />
      )}
    />
  );
}

function EntryNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: EntryNodeProps;
}) {
  const updateJourneyNodeData = useAppStore(
    (state) => state.updateJourneyNodeData,
  );

  const segments = useAppStore((state) => state.segments);

  const onSegmentChangeHandler = (
    _event: unknown,
    segment: SegmentResource | null,
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.EntryNode) {
        props.segmentId = segment?.id;
      }
    });
  };

  if (segments.type !== CompletionStatus.Successful) {
    return null;
  }

  const segment =
    segments.value.find((t) => t.id === nodeProps.segmentId) ?? null;

  return (
    <Autocomplete
      value={segment}
      options={segments.value}
      getOptionLabel={getSegmentLabel}
      onChange={onSegmentChangeHandler}
      renderInput={(params) => (
        <TextField {...params} label="segment" variant="outlined" />
      )}
    />
  );
}

function getTemplateLabel(tr: MessageTemplateResource) {
  return tr.name;
}

function MessageNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: MessageNodeProps;
}) {
  const { enableMobilePush, updateJourneyNodeData, messages } = useAppStore(
    (store) => ({
      enableMobilePush: store.enableMobilePush,
      updateJourneyNodeData: store.updateJourneyNodeData,
      templates: store.messages,
      messages: store.messages,
    }),
    shallow,
  );

  const onNameChangeHandler: React.ChangeEventHandler<
    HTMLTextAreaElement | HTMLInputElement
  > = (e) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        props.name = e.target.value;
      }
    });
  };

  const onTemplateChangeHandler = (
    _event: unknown,
    template: MessageTemplateResource | null,
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        props.templateId = template?.id;
      }
    });
  };

  const templates =
    messages.type === CompletionStatus.Successful
      ? messages.value.filter((t) => t.definition?.type === nodeProps.channel)
      : [];

  const template = templates.find((t) => t.id === nodeProps.templateId) ?? null;

  const onChannelChangeHandler: SelectInputProps<ChannelType>["onChange"] = (
    e,
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        props.channel = e.target.value as ChannelType;
      }
    });
  };

  return (
    <>
      <TextField
        label="name"
        value={nodeProps.name}
        onChange={onNameChangeHandler}
      />
      <FormControl>
        <InputLabel id="message-channel-select-label">
          Message Channel
        </InputLabel>
        <Select
          labelId="message-channel-select-label"
          label="Message Channel"
          onChange={onChannelChangeHandler}
          value={nodeProps.channel}
        >
          <MenuItem value={ChannelType.Email}>Email</MenuItem>
          <MenuItem value={ChannelType.Sms}>SMS</MenuItem>
          <MenuItem disabled={!enableMobilePush} value={ChannelType.MobilePush}>
            Mobile Push
          </MenuItem>
        </Select>
      </FormControl>
      <Autocomplete
        value={template}
        options={templates}
        getOptionLabel={getTemplateLabel}
        onChange={onTemplateChangeHandler}
        renderInput={(params) => (
          <TextField {...params} label="Template" variant="outlined" />
        )}
      />
      <SubscriptionGroupAutocomplete
        subscriptionGroupId={nodeProps.subscriptionGroupId}
        channel={nodeProps.channel}
        handler={(subscriptionGroup) => {
          updateJourneyNodeData(nodeId, (node) => {
            const props = node.data.nodeTypeProps;
            if (props.type === JourneyNodeType.MessageNode) {
              props.subscriptionGroupId = subscriptionGroup?.id;
            }
          });
        }}
      />
    </>
  );
}

const DAYS: { letter: string; day: string }[] = [
  {
    letter: "S",
    day: "Sunday",
  },
  {
    letter: "M",
    day: "Monday",
  },
  {
    letter: "T",
    day: "Tuesday",
  },
  {
    letter: "W",
    day: "Wednesday",
  },
  {
    letter: "T",
    day: "Thursday",
  },
  {
    letter: "F",
    day: "Friday",
  },
  {
    letter: "S",
    day: "Saturday",
  },
];

function DelayNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: DelayNodeProps;
}) {
  const updateJourneyNodeData = useAppStore(
    (state) => state.updateJourneyNodeData,
  );
  let variant: React.ReactElement;
  switch (nodeProps.variant.type) {
    case DelayVariantType.Second: {
      const handleDurationChange = (seconds: number) => {
        updateJourneyNodeData(nodeId, (node) => {
          const props = node.data.nodeTypeProps;
          if (
            props.type === JourneyNodeType.DelayNode &&
            props.variant.type === DelayVariantType.Second
          ) {
            props.variant.seconds = seconds;
          }
        });
      };
      variant = (
        <DurationSelect
          value={nodeProps.variant.seconds}
          onChange={handleDurationChange}
          description="Will wait"
          inputLabel="Duration"
        />
      );
      break;
    }
    case DelayVariantType.LocalTime: {
      const allowedDaysOfWeek = new Set(
        nodeProps.variant.allowedDaysOfWeek ?? DAY_INDICES,
      );
      const dayEls = DAYS.map((day, i) => {
        const index = i as AllowedDayIndices;
        return (
          <Tooltip key={day.day} title={day.day}>
            <ToggleButton
              value={index}
              sx={{
                width: 1,
                height: 1,
                borderRadius: "50%",
              }}
              selected={allowedDaysOfWeek.has(index)}
              onChange={() => {
                updateJourneyNodeData(nodeId, (node) => {
                  const props = node.data.nodeTypeProps;
                  if (
                    props.type !== JourneyNodeType.DelayNode ||
                    props.variant.type !== DelayVariantType.LocalTime
                  ) {
                    return;
                  }
                  if (allowedDaysOfWeek.has(index)) {
                    props.variant.allowedDaysOfWeek = (
                      props.variant.allowedDaysOfWeek ?? DAY_INDICES
                    ).filter((dayOfWeek) => dayOfWeek !== i);
                  } else {
                    const newAllowedDaysOfWeek: AllowedDayIndices[] = [
                      ...(props.variant.allowedDaysOfWeek ?? []),
                      index,
                    ];
                    newAllowedDaysOfWeek.sort();
                    props.variant.allowedDaysOfWeek = newAllowedDaysOfWeek;
                  }
                });
              }}
            >
              {day.letter}
            </ToggleButton>
          </Tooltip>
        );
      });
      variant = (
        <>
          <SubtleHeader>User Local Time</SubtleHeader>
          <MultiSectionDigitalClock
            value={
              new Date(
                0,
                0,
                0,
                nodeProps.variant.hour,
                nodeProps.variant.minute,
              )
            }
            onChange={(newValue) =>
              updateJourneyNodeData(nodeId, (node) => {
                const props = node.data.nodeTypeProps;
                if (
                  props.type === JourneyNodeType.DelayNode &&
                  props.variant.type === DelayVariantType.LocalTime &&
                  newValue
                ) {
                  props.variant.hour = newValue.getHours();
                  props.variant.minute = newValue.getMinutes();
                }
              })
            }
          />
          <SubtleHeader>Allowed Days of the Week</SubtleHeader>
          <Stack direction="row" spacing={1}>
            {dayEls}
          </Stack>
        </>
      );
      break;
    }
  }

  return (
    <>
      <Select
        value={nodeProps.variant.type}
        onChange={(e) => {
          updateJourneyNodeData(nodeId, (node) => {
            const props = node.data.nodeTypeProps;
            if (props.type !== JourneyNodeType.DelayNode) {
              return;
            }
            const type = e.target.value as DelayVariantType;
            if (props.variant.type === type) {
              return;
            }
            switch (type) {
              case DelayVariantType.Second:
                props.variant = {
                  type: DelayVariantType.Second,
                };
                break;
              case DelayVariantType.LocalTime:
                props.variant = {
                  type: DelayVariantType.LocalTime,
                  minute: 0,
                  hour: 8,
                };
                break;
              default:
                assertUnreachable(type);
            }
          });
        }}
      >
        <MenuItem value={DelayVariantType.Second}>Hardcoded Delay</MenuItem>
        <MenuItem value={DelayVariantType.LocalTime}>Localized Delay</MenuItem>
      </Select>
      {variant}
    </>
  );
}

function WaitForNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: WaitForNodeProps;
}) {
  const { updateJourneyNodeData, segments, updateLabelNode } = useAppStore(
    (store) => ({
      updateJourneyNodeData: store.updateJourneyNodeData,
      segments: store.segments,
      updateLabelNode: store.updateLabelNode,
    }),
    shallow,
  );

  if (segments.type !== CompletionStatus.Successful) {
    return null;
  }

  const handleDurationChange = (seconds: number) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.WaitForNode) {
        props.timeoutSeconds = seconds;
      }
    });

    updateLabelNode(nodeProps.timeoutLabelNodeId, waitForTimeoutLabel(seconds));
  };

  const onSegmentChangeHandler = (
    _event: unknown,
    segment: SegmentResource | null,
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (
        props.type === JourneyNodeType.WaitForNode &&
        props.segmentChildren[0]
      ) {
        props.segmentChildren[0].segmentId = segment?.id;
      }
    });
  };

  const segment =
    segments.value.find(
      (t) => t.id === nodeProps.segmentChildren[0]?.segmentId,
    ) ?? null;

  return (
    <>
      <Autocomplete
        value={segment}
        options={segments.value}
        getOptionLabel={getSegmentLabel}
        onChange={onSegmentChangeHandler}
        renderInput={(params) => (
          <TextField {...params} label="segment" variant="outlined" />
        )}
      />
      <DurationSelect
        inputLabel="Timeout"
        description="Will timeout after"
        value={nodeProps.timeoutSeconds}
        onChange={handleDurationChange}
      />
    </>
  );
}

function NodeLayout({
  deleteButton,
  children,
  nodeId,
}: {
  deleteButton?: boolean;
  children?: ReactNode;
  nodeId: string;
}) {
  const theme = useTheme();

  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId);
  const deleteJourneyNode = useAppStore((state) => state.deleteJourneyNode);

  const handleDelete = () => {
    setSelectedNodeId(null);
    deleteJourneyNode(nodeId);
  };
  return (
    <Stack
      sx={{ height: "100%" }}
      justifyContent="space-between"
      direction="column"
    >
      <Stack
        spacing={2}
        sx={{
          paddingLeft: 2,
          paddingRight: 2,
          paddingTop: 2,
        }}
      >
        {children}
      </Stack>
      <Stack
        flexDirection="row"
        justifyContent="right"
        alignItems="center"
        sx={{
          height: theme.spacing(8),
          paddingRight: 2,
          backgroundColor: theme.palette.grey[200],
        }}
      >
        {deleteButton ? (
          <Button
            variant="contained"
            color="error"
            startIcon={<Delete />}
            onClick={handleDelete}
          >
            Delete Journey Node
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}

function NodeFields({ node }: { node: Node<JourneyNodeProps> }) {
  const nodeProps = node.data.nodeTypeProps;

  switch (nodeProps.type) {
    case JourneyNodeType.EntryNode:
      return (
        <NodeLayout nodeId={node.id}>
          <EntryNodeFields nodeId={node.id} nodeProps={nodeProps} />
        </NodeLayout>
      );
    case JourneyNodeType.SegmentSplitNode:
      return (
        <NodeLayout deleteButton nodeId={node.id}>
          <SegmentSplitNodeFields nodeId={node.id} nodeProps={nodeProps} />
        </NodeLayout>
      );
    case JourneyNodeType.MessageNode: {
      return (
        <NodeLayout deleteButton nodeId={node.id}>
          <MessageNodeFields nodeId={node.id} nodeProps={nodeProps} />
        </NodeLayout>
      );
    }
    case JourneyNodeType.ExitNode:
      return <NodeLayout nodeId={node.id} />;
    case JourneyNodeType.DelayNode:
      return (
        <NodeLayout deleteButton nodeId={node.id}>
          <DelayNodeFields nodeId={node.id} nodeProps={nodeProps} />
        </NodeLayout>
      );
    case JourneyNodeType.WaitForNode:
      return (
        <NodeLayout deleteButton nodeId={node.id}>
          <WaitForNodeFields nodeId={node.id} nodeProps={nodeProps} />
        </NodeLayout>
      );
  }
}

function NodeEditorContents({ node }: { node: Node<JourneyNodeProps> }) {
  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId);
  const closeNodeEditor = () => {
    setSelectedNodeId(null);
  };
  return (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
      }}
    >
      <Stack
        sx={{
          padding: 2,
        }}
        alignItems="center"
        direction="row"
      >
        <Typography variant="h5" flexGrow={1}>
          Edit {journeyNodeLabel(node.data.nodeTypeProps.type)}
        </Typography>
        <IconButton onClick={closeNodeEditor}>
          <CloseOutlined />
        </IconButton>
      </Stack>
      <NodeFields node={node} />
    </Stack>
  );
}

export const journeyNodeEditorId = "journey-node-editor";

export default function NodeEditor() {
  const theme = useTheme();
  const selectedNodeId = useAppStore((state) => state.journeySelectedNodeId);
  const nodes = useAppStore((state) => state.journeyNodes);
  const nodesIndex = useAppStore((state) => state.journeyNodesIndex);
  const selectedNode = useMemo(
    () =>
      selectedNodeId
        ? findJourneyNode(selectedNodeId, nodes, nodesIndex)
        : null,
    [selectedNodeId, nodes, nodesIndex],
  );
  const isOpen = !!selectedNode;

  return (
    <Box
      id={journeyNodeEditorId}
      sx={{
        // uses full-width on mobile screens to avoid going off-screen
        width: `min(100%, ${width}px)`,
        right: isOpen ? 0 : -width,
        opacity: isOpen ? 1 : 0,
        visibility: isOpen ? "visible" : "hidden",
        height: "100%",
        transition: `opacity ${transitionDuration} ease,visibility ${transitionDuration},right ${transitionDuration} cubic-bezier(0.820, 0.085, 0.395, 0.895)`,
        border: `1px solid ${theme.palette.grey[200]}`,
        boxShadow: "0 4px 20px rgb(47 50 106 / 15%)",
        position: "absolute",
        zIndex: 20,
        backgroundColor: "white",
      }}
    >
      <>{selectedNode ? <NodeEditorContents node={selectedNode} /> : null}</>
    </Box>
  );
}
