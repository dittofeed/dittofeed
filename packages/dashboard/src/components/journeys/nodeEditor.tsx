import { Delete } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { SelectInputProps } from "@mui/material/Select/SelectInput";
import {
  ChannelType,
  CompletionStatus,
  JourneyNodeType,
  MessageTemplateResource,
  SegmentResource,
  SubscriptionGroupResource,
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
import DurationDescription from "../durationDescription";
import findJourneyNode from "./findJourneyNode";
import journeyNodeLabel from "./journeyNodeLabel";
import DurationSelect from "../durationSelect";

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
    (state) => state.updateJourneyNodeData
  );

  const segments = useAppStore((state) => state.segments);

  const onSegmentChangeHandler = (
    _event: unknown,
    segment: SegmentResource | null
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
    (state) => state.updateJourneyNodeData
  );

  const segments = useAppStore((state) => state.segments);

  const onSegmentChangeHandler = (
    _event: unknown,
    segment: SegmentResource | null
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

function getSubscriptionGroupLabel(sg: SubscriptionGroupResource) {
  return sg.name;
}

function MessageNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: MessageNodeProps;
}) {
  const {
    enableMobilePush,
    updateJourneyNodeData,
    messages,
    subscriptionGroups,
  } = useAppStore(
    (store) => ({
      enableMobilePush: store.enableMobilePush,
      updateJourneyNodeData: store.updateJourneyNodeData,
      templates: store.messages,
      messages: store.messages,
      subscriptionGroups: store.subscriptionGroups,
    }),
    shallow
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
    template: MessageTemplateResource | null
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        props.templateId = template?.id;
      }
    });
  };

  const onSubscriptionGroupChangeHandler = (
    _event: unknown,
    subscriptionGroup: SubscriptionGroupResource | null
  ) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.MessageNode) {
        props.subscriptionGroupId = subscriptionGroup?.id;
      }
    });
  };

  const templates =
    messages.type === CompletionStatus.Successful
      ? messages.value.filter((t) => t.definition.type === nodeProps.channel)
      : [];

  const template = templates.find((t) => t.id === nodeProps.templateId) ?? null;

  const subscriptionGroupItems =
    subscriptionGroups.type === CompletionStatus.Successful
      ? subscriptionGroups.value.filter(
          (sg) => sg.channel === nodeProps.channel
        )
      : [];
  const subscriptionGroup =
    subscriptionGroupItems.find(
      (s) => s.id === nodeProps.subscriptionGroupId
    ) ?? null;

  const onChannelChangeHandler: SelectInputProps<ChannelType>["onChange"] = (
    e
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
      <Autocomplete
        value={subscriptionGroup}
        options={subscriptionGroupItems}
        getOptionLabel={getSubscriptionGroupLabel}
        onChange={onSubscriptionGroupChangeHandler}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Subscription Group"
            variant="outlined"
          />
        )}
      />
    </>
  );
}

function DelayNodeFields({
  nodeId,
  nodeProps,
}: {
  nodeId: string;
  nodeProps: DelayNodeProps;
}) {
  const updateJourneyNodeData = useAppStore(
    (state) => state.updateJourneyNodeData
  );

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.DelayNode) {
        props.seconds = parseInt(e.target.value, 10);
      }
    });
  };

  return (
    <>
      <TextField
        label="Duration (Seconds)"
        InputProps={{
          type: "number",
        }}
        value={String(nodeProps.seconds)}
        onChange={handleDurationChange}
      />

      <Box>
        Will wait <DurationDescription durationSeconds={nodeProps.seconds} />
      </Box>
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
  const { updateJourneyNodeData, segments } = useAppStore(
    (store) => ({
      updateJourneyNodeData: store.updateJourneyNodeData,
      segments: store.segments,
    }),
    shallow
  );

  if (segments.type !== CompletionStatus.Successful) {
    return null;
  }

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateJourneyNodeData(nodeId, (node) => {
      const props = node.data.nodeTypeProps;
      if (props.type === JourneyNodeType.DelayNode) {
        props.seconds = parseInt(e.target.value, 10);
      }
    });
  };

  const onSegmentChangeHandler = (
    _event: unknown,
    segment: SegmentResource | null
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
      (t) => t.id === nodeProps.segmentChildren[0]?.segmentId
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
        inputLabel="Timeout (Seconds)"
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
  return (
    <Stack
      sx={{
        width: "100%",
        height: "100%",
      }}
    >
      <Typography
        variant="h5"
        sx={{
          padding: 2,
        }}
      >
        Edit {journeyNodeLabel(node.data.nodeTypeProps.type)}
      </Typography>
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
    [selectedNodeId, nodes, nodesIndex]
  );
  const isOpen = !!selectedNode;

  return (
    <Box
      id={journeyNodeEditorId}
      sx={{
        width,
        left: isOpen ? 0 : -width,
        opacity: isOpen ? 1 : 0,
        visibility: isOpen ? "visible" : "hidden",
        height: "100%",
        transition: `opacity ${transitionDuration} ease,visibility ${transitionDuration},left ${transitionDuration} cubic-bezier(0.820, 0.085, 0.395, 0.895)`,
        border: `1px solid ${theme.palette.grey[200]}`,
        boxShadow: "0 4px 20px rgb(47 50 106 / 15%)",
        position: "relative",
        zIndex: 20,
        backgroundColor: "white",
      }}
    >
      <>{selectedNode ? <NodeEditorContents node={selectedNode} /> : null}</>
    </Box>
  );
}
