import { PlusCircleFilled } from "@ant-design/icons";
import { Delete } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  SelectProps,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { isEmailEvent } from "isomorphic-lib/src/email";
import {
  CompletionStatus,
  EmailSegmentNode,
  InternalEventType,
  PerformedSegmentNode,
  SegmentEqualsOperator,
  SegmentHasBeenOperator,
  SegmentHasBeenOperatorComparator,
  SegmentNode,
  SegmentNodeType,
  SegmentOperator,
  SegmentOperatorType,
  SegmentResource,
  SegmentWithinOperator,
  SubscriptionGroupSegmentNode,
  TraitSegmentNode,
} from "isomorphic-lib/src/types";
import React, { useMemo } from "react";

import DurationDescription from "../../components/durationDescription";
import EditableName from "../../components/editableName";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import getSegmentServerSideProps from "./[id]/getSegmentServerSideProps";
import SegmentLayout from "./[id]/segmentLayout";

interface GroupedOption {
  id: SegmentNodeType;
  group: string;
  label: string;
}

const selectorWidth = "192px";

const traitGroupedOption = {
  id: SegmentNodeType.Trait,
  group: "User Data",
  label: "User Trait",
};

const broadcastGroupedOption = {
  id: SegmentNodeType.Broadcast,
  group: "User Data",
  label: "Broadcast",
};

const andGroupedOption = {
  id: SegmentNodeType.And,
  group: "Group",
  label: "All (AND)",
};
const orGroupedOption = {
  id: SegmentNodeType.Or,
  group: "Group",
  label: "Any (OR)",
};

const subscriptionGroupGroupedOption = {
  id: SegmentNodeType.SubscriptionGroup,
  group: "User Data",
  label: "Subscription Group",
};

const performedOption = {
  id: SegmentNodeType.Performed,
  group: "User Data",
  label: "User Performed",
};

const emailOption = {
  id: SegmentNodeType.Email,
  group: "Messages",
  label: "Email",
};

const segmentOptions: GroupedOption[] = [
  traitGroupedOption,
  performedOption,
  broadcastGroupedOption,
  subscriptionGroupGroupedOption,
  andGroupedOption,
  orGroupedOption,
  emailOption,
];

const keyedSegmentOptions: Record<
  Exclude<SegmentNodeType, SegmentNodeType.LastPerformed>,
  GroupedOption
> = {
  [SegmentNodeType.Trait]: traitGroupedOption,
  [SegmentNodeType.Performed]: performedOption,
  [SegmentNodeType.And]: andGroupedOption,
  [SegmentNodeType.Or]: orGroupedOption,
  [SegmentNodeType.Broadcast]: broadcastGroupedOption,
  [SegmentNodeType.SubscriptionGroup]: subscriptionGroupGroupedOption,
  [SegmentNodeType.Email]: emailOption,
};

interface Option {
  id: SegmentOperatorType;
  label: string;
}

const equalsOperatorOption = {
  id: SegmentOperatorType.Equals,
  label: "Equals",
};

const withinOperatorOption = {
  id: SegmentOperatorType.Within,
  label: "Within",
};

const hasBeenOperatorOption = {
  id: SegmentOperatorType.HasBeen,
  label: "Has Been",
};

const operatorOptions: Option[] = [
  equalsOperatorOption,
  withinOperatorOption,
  hasBeenOperatorOption,
];

const keyedOperatorOptions = new Map<SegmentOperatorType, Option>([
  [SegmentOperatorType.Equals, equalsOperatorOption],
  [SegmentOperatorType.Within, withinOperatorOption],
  [SegmentOperatorType.HasBeen, hasBeenOperatorOption],
]);

type Group = SegmentNodeType.And | SegmentNodeType.Or;

const keyedGroupLabels: Record<Group, string> = {
  [SegmentNodeType.And]: "AND",
  [SegmentNodeType.Or]: "OR",
};

export const getServerSideProps = getSegmentServerSideProps;

function ValueSelect({
  nodeId,
  operator,
}: {
  nodeId: string;
  operator: SegmentEqualsOperator | SegmentHasBeenOperator;
}) {
  const { value } = operator;

  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSegmentNodeData(nodeId, (node) => {
      if (
        node.type === SegmentNodeType.Trait &&
        (node.operator.type === SegmentOperatorType.Equals ||
          node.operator.type === SegmentOperatorType.HasBeen)
      ) {
        node.operator.value = e.target.value;
      }
    });
  };

  return (
    <Stack direction="row" spacing={1}>
      <Box sx={{ width: selectorWidth }}>
        <TextField label="Value" value={value} onChange={handleChange} />
      </Box>
    </Stack>
  );
}

function DurationValueSelect({
  nodeId,
  operator,
}: {
  nodeId: string;
  operator: SegmentWithinOperator | SegmentHasBeenOperator;
}) {
  const value = operator.windowSeconds;

  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSegmentNodeData(nodeId, (node) => {
      if (
        node.type === SegmentNodeType.Trait &&
        (node.operator.type === SegmentOperatorType.Within ||
          node.operator.type === SegmentOperatorType.HasBeen)
      ) {
        node.operator.windowSeconds = parseInt(e.target.value, 10);
      }
    });
  };

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Box sx={{ width: selectorWidth }}>
        <TextField
          label="Value (Seconds)"
          InputProps={{
            type: "number",
          }}
          value={String(value)}
          onChange={handleChange}
        />
      </Box>
      <Box>
        <DurationDescription durationSeconds={value} />
      </Box>
    </Stack>
  );
}

// TODO allow for segmenting on Track properties
function PerformedSelect({ node }: { node: PerformedSegmentNode }) {
  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData
  );

  const handleEventNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.Performed) {
        n.event = e.target.value;
      }
    });
  };

  const handleEventTimesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSegmentNodeData(node.id, (n) => {
      const times = parseInt(e.target.value, 10);
      if (n.type === SegmentNodeType.Performed && !Number.isNaN(times)) {
        n.times = times;
      }
    });
  };

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Box sx={{ width: selectorWidth }}>
        <TextField
          label="Event Name"
          value={node.event}
          onChange={handleEventNameChange}
        />
      </Box>
      <TextField
        label="Times Performed"
        InputProps={{
          type: "number",
        }}
        value={String(node.times ?? 1)}
        onChange={handleEventTimesChange}
      />
    </Stack>
  );
}

const EMAIL_EVENT_UI_LIST: [InternalEventType, { label: string }][] = [
  [
    InternalEventType.MessageSent,
    {
      label: "Email Sent",
    },
  ],
  [
    InternalEventType.EmailOpened,
    {
      label: "Email Opened",
    },
  ],
  [
    InternalEventType.EmailClicked,
    {
      label: "Email Clicked",
    },
  ],
  [
    InternalEventType.EmailBounced,
    {
      label: "Email Bounced",
    },
  ],
  [
    InternalEventType.EmailDelivered,
    {
      label: "Email Delivered",
    },
  ],
  [
    InternalEventType.EmailMarkedSpam,
    {
      label: "Email Marked as Spam",
    },
  ],
];

function EmailSelect({ node }: { node: EmailSegmentNode }) {
  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData
  );
  const onEmailEventChangeHandler: SelectProps["onChange"] = (e) => {
    updateSegmentNodeData(node.id, (n) => {
      const event = e.target.value;
      if (n.type === SegmentNodeType.Email && isEmailEvent(event)) {
        n.event = event;
      }
    });
  };

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Box sx={{ width: selectorWidth }}>
        {/* // FIXME add template */}
        <FormControl>
          <InputLabel id="email-event-label">Email Event</InputLabel>
          <Select
            label="Email Event"
            labelId="email-event-label"
            onChange={onEmailEventChangeHandler}
            value={node.event}
          >
            {EMAIL_EVENT_UI_LIST.map(([event, { label }]) => (
              <MenuItem key={event} value={event}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    </Stack>
  );
}

function SubscriptionGroupSelect({
  node,
}: {
  node: SubscriptionGroupSegmentNode;
}) {
  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData
  );
  const subscriptionGroups = useAppStore((state) => state.subscriptionGroups);
  const subscriptionGroupOptions = useMemo(
    () =>
      subscriptionGroups.type === CompletionStatus.Successful
        ? subscriptionGroups.value.map((sg) => ({
            label: sg.name,
            id: sg.id,
          }))
        : [],
    [subscriptionGroups]
  );

  const subscriptionGroup = useMemo(
    () =>
      subscriptionGroupOptions.find(
        (sg) => sg.id === node.subscriptionGroupId
      ) ?? null,
    [subscriptionGroupOptions, node.subscriptionGroupId]
  );

  return (
    <Box sx={{ width: selectorWidth }}>
      <Autocomplete
        value={subscriptionGroup}
        onChange={(_event, newValue) => {
          updateSegmentNodeData(node.id, (segmentNode) => {
            if (
              newValue &&
              segmentNode.type === SegmentNodeType.SubscriptionGroup
            ) {
              segmentNode.subscriptionGroupId = newValue.id;
            }
          });
        }}
        options={subscriptionGroupOptions}
        renderInput={(params) => (
          <TextField
            {...params}
            label="subscription group"
            variant="outlined"
          />
        )}
      />
    </Box>
  );
}

function TraitSelect({ node }: { node: TraitSegmentNode }) {
  const traitPath = node.path;
  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData
  );

  const traits = useAppStore((store) => store.traits);
  const traitOptions =
    traits.type === CompletionStatus.Successful ? traits.value : [];
  const operator = keyedOperatorOptions.get(node.operator.type);
  if (!operator) {
    throw new Error(`Unsupported operator type: ${node.operator.type}`);
  }

  let valueSelect: React.ReactElement;
  switch (node.operator.type) {
    case SegmentOperatorType.Within:
      valueSelect = (
        <DurationValueSelect nodeId={node.id} operator={node.operator} />
      );
      break;
    case SegmentOperatorType.Equals:
      valueSelect = <ValueSelect nodeId={node.id} operator={node.operator} />;
      break;
    case SegmentOperatorType.HasBeen:
      valueSelect = (
        <>
          <ValueSelect nodeId={node.id} operator={node.operator} />
          <DurationValueSelect nodeId={node.id} operator={node.operator} />
        </>
      );
      break;
    default:
      throw new Error(`Unsupported operator type: ${node.operator.type}`);
  }

  const traitOnChange = (newValue: string) => {
    updateSegmentNodeData(node.id, (segmentNode) => {
      if (segmentNode.type === SegmentNodeType.Trait) {
        segmentNode.path = newValue;
      }
    });
  };
  return (
    <>
      <Box sx={{ width: selectorWidth }}>
        <Autocomplete
          value={traitPath}
          freeSolo
          onChange={(_event, newValue) => {
            traitOnChange(newValue);
          }}
          disableClearable
          options={traitOptions}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Trait"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                const newValue = event.target.value;
                traitOnChange(newValue);
              }}
              InputProps={{
                ...params.InputProps,
                type: "search",
              }}
            />
          )}
        />
      </Box>
      <Box sx={{ width: selectorWidth }}>
        <Autocomplete
          value={operator}
          onChange={(_event: unknown, newValue: Option) => {
            updateSegmentNodeData(node.id, (segmentNode) => {
              if (
                segmentNode.type === SegmentNodeType.Trait &&
                newValue.id !== segmentNode.operator.type
              ) {
                let nodeOperator: SegmentOperator;
                switch (newValue.id) {
                  case SegmentOperatorType.Equals: {
                    nodeOperator = {
                      type: SegmentOperatorType.Equals,
                      value: "",
                    };
                    break;
                  }
                  case SegmentOperatorType.Within: {
                    nodeOperator = {
                      type: SegmentOperatorType.Within,
                      windowSeconds: 0,
                    };
                    break;
                  }
                  case SegmentOperatorType.HasBeen: {
                    nodeOperator = {
                      type: SegmentOperatorType.HasBeen,
                      comparator: SegmentHasBeenOperatorComparator.GTE,
                      value: "",
                      windowSeconds: 0,
                    };
                    break;
                  }
                  default:
                    throw new Error("Unhandled operator type");
                }
                segmentNode.operator = nodeOperator;
              }
            });
          }}
          disableClearable
          options={operatorOptions}
          renderInput={(params) => (
            <TextField label="Operator" {...params} variant="outlined" />
          )}
        />
      </Box>
      {valueSelect}
    </>
  );
}

type Label = Group | "empty";

function SegmentNodeComponent({
  node,
  label,
  renderDelete,
  parentId,
}: {
  node: SegmentNode;
  renderDelete?: boolean;
  parentId?: string;
  label?: Label;
}) {
  const updateNodeType = useAppStore(
    (state) => state.updateEditableSegmentNodeType
  );
  const theme = useTheme();
  const addChild = useAppStore((state) => state.addEditableSegmentChild);
  const removeChild = useAppStore((state) => state.removeEditableSegmentChild);
  const editedSegment = useAppStore((state) => state.editedSegment);
  const nodeById = useMemo(
    () =>
      editedSegment?.definition.nodes.reduce<Record<string, SegmentNode>>(
        (memo, segmentNode) => {
          memo[segmentNode.id] = segmentNode;
          return memo;
        },
        {}
      ),
    [editedSegment]
  );
  if (node.type === SegmentNodeType.LastPerformed) {
    throw new Error(`Unimplemented node type ${node.type}`);
  }
  if (!nodeById) {
    console.error("Missing nodeById");
    return null;
  }

  const condition = keyedSegmentOptions[node.type];
  const conditionSelect = (
    <Box sx={{ width: selectorWidth }}>
      <Autocomplete
        value={condition}
        groupBy={(option) => option.group}
        onChange={(_event: unknown, newValue: GroupedOption) => {
          updateNodeType(node.id, newValue.id);
        }}
        disableClearable
        options={segmentOptions}
        renderInput={(params) => (
          <TextField
            label="Condition or Group"
            {...params}
            variant="outlined"
          />
        )}
      />
    </Box>
  );

  const deleteButton =
    renderDelete && parentId ? (
      <IconButton
        color="error"
        size="large"
        onClick={() => removeChild(parentId, node.id)}
      >
        <Delete />
      </IconButton>
    ) : null;

  const labelEl = (
    <Box sx={{ paddingLeft: 2, paddingRight: 2 }}>
      <Typography
        sx={{
          backgroundColor: theme.palette.grey[200],
          color: theme.palette.grey[600],
          width: 50,
          visibility: label === "empty" ? "hidden" : "visible",
          display: label === undefined ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 1,
          paddingBottom: 1,
          borderRadius: 1,
        }}
      >
        {label === SegmentNodeType.And || label === SegmentNodeType.Or
          ? keyedGroupLabels[label]
          : null}
      </Typography>
    </Box>
  );

  let el: React.ReactElement;
  if (node.type === SegmentNodeType.And || node.type === SegmentNodeType.Or) {
    const rows = node.children.flatMap((childId, i) => {
      const child = nodeById[childId];
      if (!child) {
        return [];
      }

      return (
        <SegmentNodeComponent
          key={i}
          node={child}
          renderDelete={i !== 0}
          parentId={node.id}
          label={i === 0 ? "empty" : node.type}
        />
      );
    });
    el = (
      <Stack spacing={3}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {labelEl}
          {conditionSelect}
          <IconButton
            color="primary"
            size="large"
            onClick={() => addChild(node.id)}
          >
            <PlusCircleFilled />
          </IconButton>
          {deleteButton}
        </Stack>
        <Stack spacing={3} sx={{ paddingLeft: 8 }}>
          {rows}
        </Stack>
      </Stack>
    );
  } else if (node.type === SegmentNodeType.Trait) {
    el = (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {labelEl}
        {conditionSelect}
        <TraitSelect node={node} />
        {deleteButton}
      </Stack>
    );
  } else if (node.type === SegmentNodeType.Broadcast) {
    el = (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {labelEl}
        {conditionSelect}
        <Box>Actives when segment receives a broadcast.</Box>
        {deleteButton}
      </Stack>
    );
  } else if (node.type === SegmentNodeType.SubscriptionGroup) {
    el = (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {labelEl}
        {conditionSelect}
        <SubscriptionGroupSelect node={node} />
        {deleteButton}
      </Stack>
    );
  } else if (node.type === SegmentNodeType.Performed) {
    el = (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {labelEl}
        {conditionSelect}
        <PerformedSelect node={node} />
        {deleteButton}
      </Stack>
    );
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } else if (node.type === SegmentNodeType.Email) {
    el = (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {labelEl}
        {conditionSelect}
        <EmailSelect node={node} />
        {deleteButton}
      </Stack>
    );
  }

  return <>{el}</>;
}

export default function NewSegment() {
  const editedSegment = useAppStore((state) => state.editedSegment);
  const setName = useAppStore((state) => state.setEditableSegmentName);
  const apiBase = useAppStore((state) => state.apiBase);
  const segmentUpdateRequest = useAppStore(
    (state) => state.segmentUpdateRequest
  );
  const setSegmentUpdateRequest = useAppStore(
    (state) => state.setSegmentUpdateRequest
  );
  const upsertSegment = useAppStore((state) => state.upsertSegment);
  const theme = useTheme();

  if (!editedSegment) {
    return null;
  }
  const { entryNode } = editedSegment.definition;
  const { name } = editedSegment;

  const handleSave = apiRequestHandlerFactory({
    request: segmentUpdateRequest,
    setRequest: setSegmentUpdateRequest,
    responseSchema: SegmentResource,
    setResponse: upsertSegment,
    onSuccessNotice: `Saved segment ${editedSegment.name}`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to save segment ${editedSegment.name}`,
    requestConfig: {
      method: "PUT",
      url: `${apiBase}/api/segments`,
      data: editedSegment,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });

  return (
    <SegmentLayout segmentId={editedSegment.id} tab="configure">
      <Stack
        spacing={1}
        sx={{
          width: "100%",
          padding: 3,
          backgroundColor: theme.palette.grey[100],
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignContent="center"
        >
          <EditableName
            name={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button variant="contained" onClick={handleSave}>
            Save
          </Button>
        </Stack>
        <Box
          sx={{
            backgroundColor: "white",
            paddingTop: 3,
            paddingBottom: 3,
            borderRadius: 1,
            border: `1px solid ${theme.palette.grey[200]}`,
          }}
        >
          <SegmentNodeComponent node={entryNode} />
        </Box>
      </Stack>
    </SegmentLayout>
  );
}
