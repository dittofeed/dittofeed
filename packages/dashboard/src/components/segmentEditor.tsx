import { AddCircleOutlineOutlined, Delete } from "@mui/icons-material";
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
  SxProps,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { isEmailEvent } from "isomorphic-lib/src/email";
import { isBodySegmentNode } from "isomorphic-lib/src/segments";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BodySegmentNode,
  CompletionStatus,
  EmailSegmentNode,
  InternalEventType,
  PerformedSegmentNode,
  RelationalOperators,
  SegmentEqualsOperator,
  SegmentHasBeenOperator,
  SegmentHasBeenOperatorComparator,
  SegmentNode,
  SegmentNodeType,
  SegmentNotEqualsOperator,
  SegmentOperator,
  SegmentOperatorType,
  SegmentResource,
  SegmentWithinOperator,
  SubscriptionGroupSegmentNode,
  TraitSegmentNode,
} from "isomorphic-lib/src/types";
import React, { useContext, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { useAppStore, useAppStorePick } from "../lib/appStore";
import { GroupedOption } from "../lib/types";
import useLoadTraits from "../lib/useLoadTraits";
import DurationSelect from "./durationSelect";
import { SubtleHeader } from "./headers";

type SegmentGroupedOption = GroupedOption<SegmentNodeType>;

const selectorWidth = "192px";

const DisabledContext = React.createContext<{ disabled?: boolean }>({
  disabled: false,
});

const traitGroupedOption = {
  id: SegmentNodeType.Trait,
  group: "User Data",
  label: "User Trait",
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

const manualOption = {
  id: SegmentNodeType.Manual,
  group: "Manual",
  label: "Manual",
};

const segmentOptions: SegmentGroupedOption[] = [
  traitGroupedOption,
  performedOption,
  manualOption,
  subscriptionGroupGroupedOption,
  andGroupedOption,
  orGroupedOption,
  emailOption,
];

const keyedSegmentOptions: Record<
  Exclude<
    SegmentNodeType,
    SegmentNodeType.LastPerformed | SegmentNodeType.Broadcast
  >,
  SegmentGroupedOption
> = {
  [SegmentNodeType.Manual]: manualOption,
  [SegmentNodeType.Trait]: traitGroupedOption,
  [SegmentNodeType.Performed]: performedOption,
  [SegmentNodeType.And]: andGroupedOption,
  [SegmentNodeType.Or]: orGroupedOption,
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

const existsOperatorOption = {
  id: SegmentOperatorType.Exists,
  label: "Exists",
};

const hasBeenOperatorOption = {
  id: SegmentOperatorType.HasBeen,
  label: "Has Been",
};

const notEqualsOperatorOption = {
  id: SegmentOperatorType.NotEquals,
  label: "Not Equals",
};

const operatorOptions: Option[] = [
  equalsOperatorOption,
  notEqualsOperatorOption,
  withinOperatorOption,
  hasBeenOperatorOption,
  existsOperatorOption,
];

const keyedOperatorOptions = new Map<SegmentOperatorType, Option>([
  [SegmentOperatorType.Equals, equalsOperatorOption],
  [SegmentOperatorType.Within, withinOperatorOption],
  [SegmentOperatorType.HasBeen, hasBeenOperatorOption],
  [SegmentOperatorType.Exists, existsOperatorOption],
  [SegmentOperatorType.NotEquals, notEqualsOperatorOption],
]);

const relationalOperatorNames: [RelationalOperators, string][] = [
  [RelationalOperators.GreaterThanOrEqual, "At least (>=)"],
  [RelationalOperators.LessThan, "Less than (<)"],
  [RelationalOperators.Equals, "Exactly (=)"],
];

type Group = SegmentNodeType.And | SegmentNodeType.Or;

const keyedGroupLabels: Record<Group, string> = {
  [SegmentNodeType.And]: "AND",
  [SegmentNodeType.Or]: "OR",
};

function ValueSelect({
  nodeId,
  operator,
}: {
  nodeId: string;
  operator:
    | SegmentEqualsOperator
    | SegmentHasBeenOperator
    | SegmentNotEqualsOperator;
}) {
  const { value } = operator;
  const { disabled } = useContext(DisabledContext);

  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData,
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSegmentNodeData(nodeId, (node) => {
      if (
        node.type === SegmentNodeType.Trait &&
        (node.operator.type === SegmentOperatorType.Equals ||
          node.operator.type === SegmentOperatorType.NotEquals ||
          node.operator.type === SegmentOperatorType.HasBeen)
      ) {
        node.operator.value = e.target.value;
      }
    });
  };

  return (
    <Stack direction="row" spacing={1}>
      <Box sx={{ width: selectorWidth }}>
        <TextField
          disabled={disabled}
          label="Value"
          value={value}
          onChange={handleChange}
        />
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
    (state) => state.updateEditableSegmentNodeData,
  );

  const handleChange = (seconds: number) => {
    updateSegmentNodeData(nodeId, (node) => {
      if (
        node.type === SegmentNodeType.Trait &&
        (node.operator.type === SegmentOperatorType.Within ||
          node.operator.type === SegmentOperatorType.HasBeen)
      ) {
        node.operator.windowSeconds = seconds;
      }
    });
  };

  return (
    <DurationSelect
      value={value}
      onChange={handleChange}
      inputLabel="Time Value"
    />
  );
}

function PerformedSelect({ node }: { node: PerformedSegmentNode }) {
  const { disabled } = useContext(DisabledContext);

  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData,
  );

  const handleEventNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.Performed) {
        n.event = e.target.value;
      }
    });
  };

  const handleTimesOperatorChange: SelectProps["onChange"] = (e) => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.Performed) {
        n.timesOperator = e.target.value as RelationalOperators;
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

  const handleAddProperty = () => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.Performed) {
        let propertyPath: string | null = null;
        // put arbtitrary limit on the number of properties
        for (let i = 0; i < 100; i++) {
          const propertyCount = n.properties?.length ?? 0;
          const prospectivePath = `myPropertyPath${propertyCount + 1}`;
          if (!n.properties?.find((p) => p.path === prospectivePath)) {
            propertyPath = prospectivePath;
            break;
          }
        }
        if (propertyPath) {
          n.properties = n.properties ?? [];
          n.properties.push({
            path: propertyPath,
            operator: {
              type: SegmentOperatorType.Equals,
              value: "myPropertyValue",
            },
          });
        }
      }
    });
  };
  const handleAddTimeWindow = () => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.Performed) {
        n.withinSeconds = n.withinSeconds ?? 5 * 60;
      }
    });
  };

  const propertyRows = node.properties?.map((property, i) => {
    const handlePropertyPathChange = (
      e: React.ChangeEvent<HTMLInputElement>,
    ) => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.Performed) {
          const newPath = e.target.value;
          const existingProperty = n.properties?.[i];
          if (!existingProperty) {
            return;
          }
          existingProperty.path = newPath;
        }
      });
    };
    const handlePropertyValueChange = (
      e: React.ChangeEvent<HTMLInputElement>,
    ) => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.Performed) {
          const newValue = e.target.value;
          const existingProperty = n.properties?.[i];
          if (
            !existingProperty ||
            existingProperty.operator.type !== SegmentOperatorType.Equals
          ) {
            return;
          }
          existingProperty.operator.value = newValue;
        }
      });
    };
    const operator = keyedOperatorOptions.get(property.operator.type);
    const handleDelete = () => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.Performed) {
          if (!n.properties) {
            return;
          }
          n.properties = node.properties?.filter((_, index) => index !== i);
        }
      });
    };
    if (!operator) {
      return null;
    }
    if (property.operator.type !== SegmentOperatorType.Equals) {
      return null;
    }
    return (
      <Stack
        // eslint-disable-next-line react/no-array-index-key
        key={i}
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
        }}
      >
        <TextField
          label="Property Path"
          value={property.path}
          onChange={handlePropertyPathChange}
        />
        <Select value={operator.id}>
          <MenuItem value={operator.id}>{operator.label}</MenuItem>
        </Select>
        <TextField
          label="Property Value"
          onChange={handlePropertyValueChange}
          value={property.operator.value}
        />
        <IconButton
          color="error"
          size="large"
          disabled={disabled}
          onClick={handleDelete}
        >
          <Delete />
        </IconButton>
      </Stack>
    );
  });

  const withinEl =
    node.withinSeconds !== undefined ? (
      <>
        <SubtleHeader>Time Window</SubtleHeader>
        <Stack direction="row" spacing={1}>
          <DurationSelect
            value={node.withinSeconds}
            inputLabel="Event Occurred Within The Last"
            onChange={(seconds) => {
              updateSegmentNodeData(node.id, (n) => {
                if (n.type === SegmentNodeType.Performed) {
                  n.withinSeconds = seconds;
                }
              });
            }}
          />
          <IconButton
            color="error"
            size="large"
            disabled={disabled}
            onClick={() => {
              updateSegmentNodeData(node.id, (n) => {
                if (n.type === SegmentNodeType.Performed) {
                  n.withinSeconds = undefined;
                }
              });
            }}
          >
            <Delete />
          </IconButton>
        </Stack>
      </>
    ) : null;

  return (
    <Stack direction="column" spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Box sx={{ width: selectorWidth }}>
          <TextField
            disabled={disabled}
            label="Event Name"
            value={node.event}
            onChange={handleEventNameChange}
          />
        </Box>
        <Select
          onChange={handleTimesOperatorChange}
          disabled={disabled}
          value={node.timesOperator ?? RelationalOperators.Equals}
        >
          {relationalOperatorNames.map(([operator, label]) => (
            <MenuItem key={operator} value={operator}>
              {label}
            </MenuItem>
          ))}
        </Select>
        <TextField
          disabled={disabled}
          label="Times Performed"
          InputProps={{
            type: "number",
          }}
          value={String(node.times ?? 1)}
          onChange={handleEventTimesChange}
        />
        <Button variant="contained" onClick={() => handleAddProperty()}>
          Property
        </Button>
        <Button variant="contained" onClick={() => handleAddTimeWindow()}>
          Time Window
        </Button>
      </Stack>
      {propertyRows?.length ? <SubtleHeader>Properties</SubtleHeader> : null}
      {propertyRows}
      {withinEl}
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
  const { disabled } = useContext(DisabledContext);

  const { updateEditableSegmentNodeData, messages } = useAppStore(
    (store) => ({
      updateEditableSegmentNodeData: store.updateEditableSegmentNodeData,
      messages: store.messages,
    }),
    shallow,
  );

  const onEmailEventChangeHandler: SelectProps["onChange"] = (e) => {
    updateEditableSegmentNodeData(node.id, (n) => {
      const event = e.target.value;
      if (n.type === SegmentNodeType.Email && isEmailEvent(event)) {
        n.event = event;
      }
    });
  };

  const { messageOptions, message } = useMemo(() => {
    const msgOpt =
      messages.type === CompletionStatus.Successful
        ? messages.value.map((m) => ({
            label: m.name,
            id: m.id,
          }))
        : [];
    const msg = msgOpt.find((m) => m.id === node.templateId) ?? null;

    return {
      messageOptions: msgOpt,
      message: msg,
    };
  }, [messages, node.templateId]);

  const eventLabelId = `email-event-label-${node.id}`;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <FormControl>
        <InputLabel id={eventLabelId}>Email Event</InputLabel>
        <Select
          disabled={disabled}
          label="Email Event"
          labelId={eventLabelId}
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
      <Box sx={{ width: selectorWidth }}>
        <Tooltip placement="right" arrow title={message?.label}>
          <Autocomplete
            value={message}
            disabled={disabled}
            onChange={(_event, newValue) => {
              updateEditableSegmentNodeData(node.id, (segmentNode) => {
                if (newValue && segmentNode.type === SegmentNodeType.Email) {
                  segmentNode.templateId = newValue.id;
                }
              });
            }}
            options={messageOptions}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Email Template"
                variant="outlined"
              />
            )}
          />
        </Tooltip>
      </Box>
    </Stack>
  );
}

function SubscriptionGroupSelect({
  node,
}: {
  node: SubscriptionGroupSegmentNode;
}) {
  const { disabled } = useContext(DisabledContext);
  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData,
  );
  const subscriptionGroups = useAppStore((state) => state.subscriptionGroups);
  const subscriptionGroupOptions = useMemo(
    () =>
      subscriptionGroups.map((sg) => ({
        label: sg.name,
        id: sg.id,
      })),
    [subscriptionGroups],
  );

  const subscriptionGroup = useMemo(
    () =>
      subscriptionGroupOptions.find(
        (sg) => sg.id === node.subscriptionGroupId,
      ) ?? null,
    [subscriptionGroupOptions, node.subscriptionGroupId],
  );

  return (
    <Box sx={{ width: selectorWidth }}>
      <Autocomplete
        disabled={disabled}
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
    (state) => state.updateEditableSegmentNodeData,
  );
  const { disabled } = useContext(DisabledContext);

  const traits = useAppStore((store) => store.traits);
  const operator = keyedOperatorOptions.get(node.operator.type);
  if (!operator) {
    throw new Error(`Unsupported operator type: ${node.operator.type}`);
  }

  let valueSelect: React.ReactElement | null;
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
    case SegmentOperatorType.NotEquals: {
      valueSelect = <ValueSelect nodeId={node.id} operator={node.operator} />;
      break;
    }
    case SegmentOperatorType.Exists: {
      valueSelect = null;
      break;
    }
    default: {
      assertUnreachable(node.operator);
    }
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
          options={traits}
          renderInput={(params) => (
            <TextField
              {...params}
              disabled={disabled}
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
          disabled={disabled}
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
                  case SegmentOperatorType.Exists: {
                    nodeOperator = {
                      type: SegmentOperatorType.Exists,
                    };
                    break;
                  }
                  case SegmentOperatorType.NotEquals: {
                    nodeOperator = {
                      type: SegmentOperatorType.NotEquals,
                      value: "",
                    };
                    break;
                  }
                  default: {
                    assertUnreachable(newValue.id);
                  }
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

function BodySegmentNodeComponent({
  node,
  label,
  renderDelete,
  parentId,
}: {
  node: BodySegmentNode;
  renderDelete?: boolean;
  parentId?: string;
  label?: Label;
}) {
  const updateNodeType = useAppStore(
    (state) => state.updateEditableSegmentNodeType,
  );
  const theme = useTheme();
  const addChild = useAppStore((state) => state.addEditableSegmentChild);
  const removeChild = useAppStore((state) => state.removeEditableSegmentChild);
  const editedSegment = useAppStore((state) => state.editedSegment);
  const { disabled } = useContext(DisabledContext);
  const nodeById = useMemo(
    () =>
      editedSegment?.definition.nodes.reduce<Record<string, SegmentNode>>(
        (memo, segmentNode) => {
          memo[segmentNode.id] = segmentNode;
          return memo;
        },
        {},
      ),
    [editedSegment],
  );
  if (
    node.type === SegmentNodeType.LastPerformed ||
    node.type === SegmentNodeType.Broadcast
  ) {
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
        onChange={(_event: unknown, newValue: SegmentGroupedOption) => {
          updateNodeType(node.id, newValue.id);
        }}
        disableClearable
        options={segmentOptions}
        disabled={disabled}
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
        disabled={disabled}
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
      if (!child || !isBodySegmentNode(child)) {
        return [];
      }

      return (
        <BodySegmentNodeComponent
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
        {/* <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}> */}
        <Stack direction="row" spacing={1}>
          {labelEl}
          {conditionSelect}
          <IconButton
            color="primary"
            disabled={disabled}
            size="large"
            onClick={() => addChild(node.id)}
          >
            <AddCircleOutlineOutlined />
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
      <Stack direction="row" spacing={1}>
        {labelEl}
        {conditionSelect}
        <TraitSelect node={node} />
        {deleteButton}
      </Stack>
    );
  } else if (node.type === SegmentNodeType.SubscriptionGroup) {
    el = (
      <Stack direction="row" spacing={1}>
        {labelEl}
        {conditionSelect}
        <SubscriptionGroupSelect node={node} />
        {deleteButton}
      </Stack>
    );
  } else if (node.type === SegmentNodeType.Performed) {
    el = (
      <Stack direction="row" spacing={1}>
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
  } else {
    assertUnreachable(node);
  }

  return <>{el}</>;
}

export function EntryNodeComponent({ node }: { node: SegmentNode }) {
  let content: React.ReactElement;
  switch (node.type) {
    case SegmentNodeType.Manual:
      content = <Typography>Manual Segment</Typography>;
      break;
    default:
      throw new Error(`Unsupported entry node type ${node.type}`);
  }
  return <>content</>;
}

export function SegmentEditorInner({
  sx,
  disabled,
  editedSegment,
}: {
  sx?: SxProps;
  disabled?: boolean;
  editedSegment: SegmentResource;
}) {
  const theme = useTheme();

  const { entryNode } = editedSegment.definition;
  const memoizedDisabled = useMemo(() => ({ disabled }), [disabled]);
  useLoadTraits();
  let content: React.ReactElement;
  if (isBodySegmentNode(entryNode)) {
    content = (
      <BodySegmentNodeComponent
        node={entryNode}
        renderDelete={false}
        label="empty"
      />
    );
  } else {
    content = <EntryNodeComponent node={entryNode} />;
  }

  return (
    <DisabledContext.Provider value={memoizedDisabled}>
      <Box
        sx={{
          backgroundColor: "white",
          paddingTop: 3,
          paddingBottom: 3,
          borderRadius: 1,
          border: `1px solid ${theme.palette.grey[200]}`,
          ...sx,
        }}
      >
        {content}
      </Box>
    </DisabledContext.Provider>
  );
}

export default function SegmentEditor({ disabled }: { disabled?: boolean }) {
  const { editedSegment } = useAppStorePick(["editedSegment"]);

  if (!editedSegment) {
    return null;
  }

  return (
    <SegmentEditorInner editedSegment={editedSegment} disabled={disabled} />
  );
}
