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
  SelectChangeEvent,
  SelectProps,
  Stack,
  SxProps,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import axios from "axios";
import {
  SEGMENT_ID_HEADER,
  WORKSPACE_ID_HEADER,
} from "isomorphic-lib/src/constants";
import { isEmailEvent } from "isomorphic-lib/src/email";
import { round } from "isomorphic-lib/src/numbers";
import { isBodySegmentNode } from "isomorphic-lib/src/segments";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  CompletionStatus,
  EmailSegmentNode,
  InternalEventType,
  KeyedPerformedPropertiesOperator,
  KeyedPerformedSegmentNode,
  LastPerformedSegmentNode,
  ManualSegmentNode,
  ManualSegmentOperationEnum,
  ManualSegmentUploadCsvHeaders,
  PerformedSegmentNode,
  RandomBucketSegmentNode,
  RelationalOperators,
  SegmentEqualsOperator,
  SegmentGreaterThanOrEqualOperator,
  SegmentHasBeenOperator,
  SegmentHasBeenOperatorComparator,
  SegmentLessThanOperator,
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
import React, { useCallback, useContext, useEffect, useMemo } from "react";
import { useImmer } from "use-immer";
import { shallow } from "zustand/shallow";

import { useAppStore, useAppStorePick } from "../lib/appStore";
import { GroupedOption } from "../lib/types";
import useLoadProperties from "../lib/useLoadProperties";
import useLoadTraits from "../lib/useLoadTraits";
import { useSegmentQuery } from "../lib/useSegmentQuery";
import { CsvUploader } from "./csvUploader";
import DurationSelect from "./durationSelect";
import { SubtleHeader } from "./headers";
import InfoTooltip from "./infoTooltip";
import TraitAutocomplete from "./traitAutocomplete";

type SegmentGroupedOption = GroupedOption<SegmentNodeType>;

const selectorWidth = "192px";
const secondarySelectorWidth = "128px";

interface SegmentEditorContextType {
  disabled?: boolean;
  editedSegment: SegmentResource;
}

const SegmentEditorContext = React.createContext<
  SegmentEditorContextType | undefined
>(undefined);

function useSegmentEditorContext() {
  const context = useContext(SegmentEditorContext);
  if (!context) {
    throw new Error(
      "useSegmentEditorContext must be used within a SegmentEditorContext.Provider",
    );
  }
  return context;
}

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

// deprecated
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

const randomBucketOption = {
  id: SegmentNodeType.RandomBucket,
  group: "User Data",
  label: "Random Bucket",
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

const keyedPerformedOption = {
  id: SegmentNodeType.KeyedPerformed,
  group: "User Data",
  label: "Keyed Performed",
};

const everyoneOption = {
  id: SegmentNodeType.Everyone,
  group: "User Data",
  label: "Everyone",
};

const lastPerformedOption = {
  id: SegmentNodeType.LastPerformed,
  group: "User Data",
  label: "Last Performed",
};

const SEGMENT_OPTIONS: SegmentGroupedOption[] = [
  traitGroupedOption,
  performedOption,
  lastPerformedOption,
  everyoneOption,
  randomBucketOption,
  keyedPerformedOption,
  manualOption,
  andGroupedOption,
  orGroupedOption,
  emailOption,
];

const keyedSegmentOptions: Record<
  Exclude<SegmentNodeType, SegmentNodeType.Broadcast>,
  SegmentGroupedOption
> = {
  [SegmentNodeType.Everyone]: everyoneOption,
  [SegmentNodeType.Manual]: manualOption,
  [SegmentNodeType.Trait]: traitGroupedOption,
  [SegmentNodeType.Performed]: performedOption,
  [SegmentNodeType.KeyedPerformed]: keyedPerformedOption,
  [SegmentNodeType.And]: andGroupedOption,
  [SegmentNodeType.Or]: orGroupedOption,
  [SegmentNodeType.SubscriptionGroup]: subscriptionGroupGroupedOption,
  [SegmentNodeType.Email]: emailOption,
  [SegmentNodeType.LastPerformed]: lastPerformedOption,
  [SegmentNodeType.RandomBucket]: randomBucketOption,
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

const lessThanOperatorOption = {
  id: SegmentOperatorType.LessThan,
  label: "Less Than",
};

const greaterThanOrEqualOperatorOption = {
  id: SegmentOperatorType.GreaterThanOrEqual,
  label: "Greater Than Or Equal",
};

const notExistsOperatorOption = {
  id: SegmentOperatorType.NotExists,
  label: "Not Exists",
};

const traitOperatorOptions: Option[] = [
  equalsOperatorOption,
  notEqualsOperatorOption,
  withinOperatorOption,
  hasBeenOperatorOption,
  existsOperatorOption,
  notExistsOperatorOption,
  lessThanOperatorOption,
  greaterThanOrEqualOperatorOption,
];

const keyedOperatorOptions: Record<SegmentOperatorType, Option> = {
  [SegmentOperatorType.NotExists]: notExistsOperatorOption,
  [SegmentOperatorType.Equals]: equalsOperatorOption,
  [SegmentOperatorType.Within]: withinOperatorOption,
  [SegmentOperatorType.HasBeen]: hasBeenOperatorOption,
  [SegmentOperatorType.Exists]: existsOperatorOption,
  [SegmentOperatorType.NotEquals]: notEqualsOperatorOption,
  [SegmentOperatorType.LessThan]: lessThanOperatorOption,
  [SegmentOperatorType.GreaterThanOrEqual]: greaterThanOrEqualOperatorOption,
};
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

interface HasBeenComparatorOption {
  id: SegmentHasBeenOperatorComparator;
  label: string;
}

const hasBeenComparatorOptionGTE = {
  id: SegmentHasBeenOperatorComparator.GTE,
  label: "At least",
};

const hasBeenComparatorOptionLT = {
  id: SegmentHasBeenOperatorComparator.LT,
  label: "Less than",
};

const hasBeenComparatorOptions: HasBeenComparatorOption[] = [
  hasBeenComparatorOptionGTE,
  hasBeenComparatorOptionLT,
];

const keyedHasBeenComparatorOptions: Record<
  SegmentHasBeenOperatorComparator,
  HasBeenComparatorOption
> = {
  [SegmentHasBeenOperatorComparator.GTE]: hasBeenComparatorOptionGTE,
  [SegmentHasBeenOperatorComparator.LT]: hasBeenComparatorOptionLT,
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
  const { disabled } = useContext(SegmentEditorContext);

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
    <Box sx={{ width: selectorWidth }}>
      <TextField
        disabled={disabled}
        label="Value"
        value={value}
        onChange={handleChange}
      />
    </Box>
  );
}

function NumericValueSelect({
  nodeId,
  operator,
}: {
  nodeId: string;
  operator: SegmentLessThanOperator | SegmentGreaterThanOrEqualOperator;
}) {
  const { value } = operator;
  const { disabled } = useContext(SegmentEditorContext);

  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData,
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSegmentNodeData(nodeId, (node) => {
      if (
        node.type === SegmentNodeType.Trait &&
        (node.operator.type === SegmentOperatorType.LessThan ||
          node.operator.type === SegmentOperatorType.GreaterThanOrEqual)
      ) {
        node.operator.value = Number(e.target.value);
      }
    });
  };

  return (
    <Box sx={{ width: selectorWidth }}>
      <TextField
        disabled={disabled}
        label="Value"
        value={value}
        InputProps={{
          type: "number",
        }}
        onChange={handleChange}
      />
    </Box>
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
      timeFieldSx={{ width: secondarySelectorWidth }}
      onChange={handleChange}
      inputLabel="Time Value"
    />
  );
}

function LastPerformedSelect({ node }: { node: LastPerformedSegmentNode }) {
  const { disabled } = useContext(SegmentEditorContext);
  const { properties } = useAppStorePick(["properties"]);

  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData,
  );

  const handleEventNameChange = (newEvent: string) => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.LastPerformed) {
        n.event = newEvent;
      }
    });
  };

  const handleAddHasProperty = () => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.LastPerformed) {
        let propertyPath: string | null = null;
        // put arbtitrary limit on the number of properties
        for (let i = 0; i < 100; i++) {
          const propertyCount = n.hasProperties?.length ?? 0;
          const prospectivePath = `myPropertyPath${propertyCount + 1}`;
          if (!n.hasProperties?.find((p) => p.path === prospectivePath)) {
            propertyPath = prospectivePath;
            break;
          }
        }
        if (propertyPath) {
          n.hasProperties = n.hasProperties ?? [];
          n.hasProperties.push({
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

  const handleAddWhereProperty = () => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.LastPerformed) {
        let propertyPath: string | null = null;
        // put arbtitrary limit on the number of properties
        for (let i = 0; i < 100; i++) {
          const propertyCount = n.whereProperties?.length ?? 0;
          const prospectivePath = `myPropertyPath${propertyCount + 1}`;
          if (!n.whereProperties?.find((p) => p.path === prospectivePath)) {
            propertyPath = prospectivePath;
            break;
          }
        }
        if (propertyPath) {
          n.whereProperties = n.whereProperties ?? [];
          n.whereProperties.push({
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
  const hasPropertyRows = node.hasProperties?.map((property, i) => {
    const handlePropertyPathChange = (newPath: string) => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.LastPerformed) {
          const existingProperty = n.hasProperties?.[i];
          if (!existingProperty) {
            return;
          }
          existingProperty.path = newPath;
        }
      });
    };
    const operator = keyedOperatorOptions[property.operator.type];
    const handleDelete = () => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.LastPerformed) {
          if (!n.hasProperties) {
            return;
          }
          n.hasProperties = node.hasProperties?.filter(
            (_, index) => index !== i,
          );
        }
      });
    };

    const handleOperatorChange = (
      e: SelectChangeEvent<SegmentOperatorType>,
    ) => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.LastPerformed) {
          const newOperator = e.target.value as SegmentOperatorType;
          const existingProperty = n.hasProperties?.[i];
          if (!existingProperty) {
            return;
          }
          existingProperty.operator.type = newOperator;
        }
      });
    };
    if (!operator) {
      return null;
    }
    let operatorEl: React.ReactNode;
    switch (property.operator.type) {
      case SegmentOperatorType.Equals: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.LastPerformed) {
              const newValue = e.target.value;
              const existingProperty = n.hasProperties?.[i];
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
        operatorEl = (
          <TextField
            label="Property Value"
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.NotEquals: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.LastPerformed) {
              const newValue = e.target.value;
              const existingProperty = n.hasProperties?.[i];
              if (
                !existingProperty ||
                existingProperty.operator.type !== SegmentOperatorType.NotEquals
              ) {
                return;
              }
              existingProperty.operator.value = newValue;
            }
          });
        };
        operatorEl = (
          <TextField
            label="Property Value"
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.GreaterThanOrEqual: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.LastPerformed) {
              const newValue = Number(e.target.value);
              const existingProperty = n.hasProperties?.[i];
              if (
                !existingProperty ||
                existingProperty.operator.type !==
                  SegmentOperatorType.GreaterThanOrEqual ||
                Number.isNaN(newValue)
              ) {
                return;
              }
              existingProperty.operator.value = newValue;
            }
          });
        };
        operatorEl = (
          <TextField
            label="Property Value"
            InputProps={{
              type: "number",
            }}
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.LessThan: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.LastPerformed) {
              const newValue = Number(e.target.value);
              const existingProperty = n.hasProperties?.[i];
              if (
                !existingProperty ||
                existingProperty.operator.type !==
                  SegmentOperatorType.LessThan ||
                Number.isNaN(newValue)
              ) {
                return;
              }
              existingProperty.operator.value = newValue;
            }
          });
        };
        operatorEl = (
          <TextField
            label="Property Value"
            InputProps={{
              type: "number",
            }}
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.Exists: {
        operatorEl = null;
        break;
      }
      case SegmentOperatorType.NotExists: {
        operatorEl = null;
        break;
      }
      default: {
        throw new Error(`Unsupported operator type: ${property.operator.type}`);
      }
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
        <Autocomplete
          value={property.path}
          disabled={disabled}
          freeSolo
          sx={{ width: selectorWidth }}
          options={properties[node.event] ?? []}
          onInputChange={(_event, newPath) => {
            if (newPath === undefined || newPath === null) {
              return;
            }
            handlePropertyPathChange(newPath);
          }}
          renderInput={(params) => (
            <TextField label="Property Path" {...params} variant="outlined" />
          )}
        />
        <Select value={operator.id} onChange={handleOperatorChange}>
          <MenuItem value={SegmentOperatorType.Equals}>
            {keyedOperatorOptions[SegmentOperatorType.Equals].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.NotEquals}>
            {keyedOperatorOptions[SegmentOperatorType.NotEquals].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.GreaterThanOrEqual}>
            {keyedOperatorOptions[SegmentOperatorType.GreaterThanOrEqual].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.LessThan}>
            {keyedOperatorOptions[SegmentOperatorType.LessThan].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.Exists}>
            {keyedOperatorOptions[SegmentOperatorType.Exists].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.NotExists}>
            {keyedOperatorOptions[SegmentOperatorType.NotExists].label}
          </MenuItem>
        </Select>
        {operatorEl}
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

  const wherePropertyRows = node.whereProperties?.map((property, i) => {
    const handlePropertyPathChange = (newPath: string) => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.LastPerformed) {
          const existingProperty = n.whereProperties?.[i];
          if (!existingProperty) {
            return;
          }
          existingProperty.path = newPath;
        }
      });
    };
    const operator = keyedOperatorOptions[property.operator.type];
    const handleDelete = () => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.LastPerformed) {
          if (!n.whereProperties) {
            return;
          }
          n.whereProperties = node.whereProperties?.filter(
            (_, index) => index !== i,
          );
        }
      });
    };

    const handleOperatorChange = (
      e: SelectChangeEvent<SegmentOperatorType>,
    ) => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.LastPerformed) {
          const newOperator = e.target.value as SegmentOperatorType;
          const existingProperty = n.whereProperties?.[i];
          if (!existingProperty) {
            return;
          }
          existingProperty.operator.type = newOperator;
        }
      });
    };
    if (!operator) {
      return null;
    }
    let operatorEl: React.ReactNode;
    switch (property.operator.type) {
      case SegmentOperatorType.Equals: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.LastPerformed) {
              const newValue = e.target.value;
              const existingProperty = n.whereProperties?.[i];
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
        operatorEl = (
          <TextField
            label="Property Value"
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.NotEquals: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.LastPerformed) {
              const newValue = e.target.value;
              const existingProperty = n.whereProperties?.[i];
              if (
                !existingProperty ||
                existingProperty.operator.type !== SegmentOperatorType.NotEquals
              ) {
                return;
              }
              existingProperty.operator.value = newValue;
            }
          });
        };
        operatorEl = (
          <TextField
            label="Property Value"
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.Exists: {
        operatorEl = null;
        break;
      }
      case SegmentOperatorType.NotExists: {
        operatorEl = null;
        break;
      }
      default: {
        throw new Error(`Unsupported operator type: ${property.operator.type}`);
      }
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
        <Autocomplete
          value={property.path}
          disabled={disabled}
          freeSolo
          sx={{ width: selectorWidth }}
          options={properties[node.event] ?? []}
          onInputChange={(_event, newPath) => {
            if (newPath === undefined || newPath === null) {
              return;
            }
            handlePropertyPathChange(newPath);
          }}
          renderInput={(params) => (
            <TextField label="Property Path" {...params} variant="outlined" />
          )}
        />
        <Select value={operator.id} onChange={handleOperatorChange}>
          <MenuItem value={SegmentOperatorType.Equals}>
            {keyedOperatorOptions[SegmentOperatorType.Equals].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.NotEquals}>
            {keyedOperatorOptions[SegmentOperatorType.NotEquals].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.Exists}>
            {keyedOperatorOptions[SegmentOperatorType.Exists].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.NotExists}>
            {keyedOperatorOptions[SegmentOperatorType.NotExists].label}
          </MenuItem>
        </Select>
        {operatorEl}
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

  return (
    <Stack direction="column" spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Autocomplete
          value={node.event}
          disabled={disabled}
          freeSolo
          sx={{ width: selectorWidth }}
          options={Object.keys(properties)}
          onInputChange={(_event, newPath) => {
            if (newPath === undefined || newPath === null) {
              return;
            }
            handleEventNameChange(newPath);
          }}
          renderInput={(params) => (
            <TextField label="Event Name" {...params} variant="outlined" />
          )}
        />
        <Button variant="contained" onClick={handleAddWhereProperty}>
          Where Property
          <InfoTooltip title="Used to select which events are eligible to be considered." />
        </Button>
        <Button variant="contained" onClick={handleAddHasProperty}>
          Has Property
          <InfoTooltip title="A user is in the segment if the selected event has the propertties." />
        </Button>
      </Stack>
      {wherePropertyRows?.length ? (
        <SubtleHeader>Where Properties</SubtleHeader>
      ) : null}
      {wherePropertyRows}
      {hasPropertyRows?.length ? (
        <SubtleHeader>Has Properties</SubtleHeader>
      ) : null}
      {hasPropertyRows}
    </Stack>
  );
}

function PerformedSelect({ node }: { node: PerformedSegmentNode }) {
  const { disabled } = useContext(SegmentEditorContext);
  const { properties } = useAppStorePick(["properties"]);

  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData,
  );

  const handleEventNameChange = (newEvent: string) => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.Performed) {
        n.event = newEvent;
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
    const handlePropertyPathChange = (newPath: string) => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.Performed) {
          const existingProperty = n.properties?.[i];
          if (!existingProperty) {
            return;
          }
          existingProperty.path = newPath;
        }
      });
    };
    const operator = keyedOperatorOptions[property.operator.type];
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

    const handleOperatorChange = (
      e: SelectChangeEvent<SegmentOperatorType>,
    ) => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.Performed) {
          const newOperator = e.target.value as SegmentOperatorType;
          const existingProperty = n.properties?.[i];
          if (!existingProperty) {
            return;
          }
          existingProperty.operator.type = newOperator;
        }
      });
    };
    if (!operator) {
      return null;
    }
    let operatorEl: React.ReactNode;
    switch (property.operator.type) {
      case SegmentOperatorType.Equals: {
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
        operatorEl = (
          <TextField
            label="Property Value"
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.GreaterThanOrEqual: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.Performed) {
              const newValue = Number(e.target.value);
              const existingProperty = n.properties?.[i];
              if (
                !existingProperty ||
                existingProperty.operator.type !==
                  SegmentOperatorType.GreaterThanOrEqual ||
                Number.isNaN(newValue)
              ) {
                return;
              }
              existingProperty.operator.value = newValue;
            }
          });
        };
        operatorEl = (
          <TextField
            label="Property Value"
            InputProps={{
              type: "number",
            }}
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.LessThan: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.Performed) {
              const newValue = Number(e.target.value);
              const existingProperty = n.properties?.[i];
              if (
                !existingProperty ||
                existingProperty.operator.type !==
                  SegmentOperatorType.LessThan ||
                Number.isNaN(newValue)
              ) {
                return;
              }
              existingProperty.operator.value = newValue;
            }
          });
        };
        operatorEl = (
          <TextField
            label="Property Value"
            InputProps={{
              type: "number",
            }}
            onChange={handlePropertyValueChange}
            value={property.operator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.Exists: {
        operatorEl = null;
        break;
      }
      default: {
        throw new Error(`Unsupported operator type: ${property.operator.type}`);
      }
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
        <Autocomplete
          value={property.path}
          disabled={disabled}
          freeSolo
          sx={{ width: selectorWidth }}
          options={properties[node.event] ?? []}
          onInputChange={(_event, newPath) => {
            if (newPath === undefined || newPath === null) {
              return;
            }
            handlePropertyPathChange(newPath);
          }}
          renderInput={(params) => (
            <TextField label="Property Path" {...params} variant="outlined" />
          )}
        />
        <Select value={operator.id} onChange={handleOperatorChange}>
          <MenuItem value={SegmentOperatorType.Equals}>
            {keyedOperatorOptions[SegmentOperatorType.Equals].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.Exists}>
            {keyedOperatorOptions[SegmentOperatorType.Exists].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.GreaterThanOrEqual}>
            {keyedOperatorOptions[SegmentOperatorType.GreaterThanOrEqual].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.LessThan}>
            {keyedOperatorOptions[SegmentOperatorType.LessThan].label}
          </MenuItem>
        </Select>
        {operatorEl}
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
        <Autocomplete
          value={node.event}
          disabled={disabled}
          freeSolo
          sx={{ width: selectorWidth }}
          options={Object.keys(properties)}
          onInputChange={(_event, newPath) => {
            if (newPath === undefined || newPath === null) {
              return;
            }
            handleEventNameChange(newPath);
          }}
          renderInput={(params) => (
            <TextField label="Event Name" {...params} variant="outlined" />
          )}
        />
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

function KeyedPerformedSelect({ node }: { node: KeyedPerformedSegmentNode }) {
  const { disabled } = useContext(SegmentEditorContext);
  const { properties } = useAppStorePick(["properties"]);

  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData,
  );

  const handleEventNameChange = (newEvent: string) => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.KeyedPerformed) {
        n.event = newEvent;
      }
    });
  };

  const handleTimesOperatorChange: SelectProps["onChange"] = (e) => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.KeyedPerformed) {
        n.timesOperator = e.target.value as RelationalOperators;
      }
    });
  };

  const handleEventTimesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSegmentNodeData(node.id, (n) => {
      const times = parseInt(e.target.value, 10);
      if (n.type === SegmentNodeType.KeyedPerformed && !Number.isNaN(times)) {
        n.times = times;
      }
    });
  };

  const handleAddProperty = () => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.KeyedPerformed) {
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

  const propertyRows = node.properties?.map((property, i) => {
    const handlePropertyPathChange = (newPath: string) => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.KeyedPerformed) {
          const existingProperty = n.properties?.[i];
          if (!existingProperty) {
            return;
          }
          existingProperty.path = newPath;
        }
      });
    };
    const operator = keyedOperatorOptions[property.operator.type];
    const handleDelete = () => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.KeyedPerformed) {
          if (!n.properties) {
            return;
          }
          n.properties = node.properties?.filter((_, index) => index !== i);
        }
      });
    };

    const handleOperatorChange = (
      e: SelectChangeEvent<SegmentOperatorType>,
    ) => {
      updateSegmentNodeData(node.id, (n) => {
        if (n.type === SegmentNodeType.KeyedPerformed) {
          const newOperator = e.target
            .value as KeyedPerformedPropertiesOperator["type"];
          const existingProperty = n.properties?.[i];
          if (!existingProperty) {
            return;
          }
          existingProperty.operator.type = newOperator;
        }
      });
    };
    if (!operator) {
      return null;
    }
    let operatorEl: React.ReactNode;
    const propertyOperator = property.operator;
    switch (propertyOperator.type) {
      case SegmentOperatorType.Equals: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.KeyedPerformed) {
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
        operatorEl = (
          <TextField
            label="Property Value"
            onChange={handlePropertyValueChange}
            value={propertyOperator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.GreaterThanOrEqual: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.KeyedPerformed) {
              const newValue = Number(e.target.value);
              const existingProperty = n.properties?.[i];
              if (
                !existingProperty ||
                existingProperty.operator.type !==
                  SegmentOperatorType.GreaterThanOrEqual ||
                Number.isNaN(newValue)
              ) {
                return;
              }
              existingProperty.operator.value = newValue;
            }
          });
        };
        operatorEl = (
          <TextField
            label="Property Value"
            InputProps={{
              type: "number",
            }}
            onChange={handlePropertyValueChange}
            value={propertyOperator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.LessThan: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateSegmentNodeData(node.id, (n) => {
            if (n.type === SegmentNodeType.KeyedPerformed) {
              const newValue = Number(e.target.value);
              const existingProperty = n.properties?.[i];
              if (
                !existingProperty ||
                existingProperty.operator.type !==
                  SegmentOperatorType.LessThan ||
                Number.isNaN(newValue)
              ) {
                return;
              }
              existingProperty.operator.value = newValue;
            }
          });
        };
        operatorEl = (
          <TextField
            label="Property Value"
            InputProps={{
              type: "number",
            }}
            onChange={handlePropertyValueChange}
            value={propertyOperator.value}
          />
        );
        break;
      }
      case SegmentOperatorType.Exists: {
        operatorEl = null;
        break;
      }
      default: {
        assertUnreachable(propertyOperator);
      }
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
        <Autocomplete
          value={property.path}
          disabled={disabled}
          freeSolo
          sx={{ width: selectorWidth }}
          options={properties[node.event] ?? []}
          onInputChange={(_event, newPath) => {
            if (newPath === undefined || newPath === null) {
              return;
            }
            handlePropertyPathChange(newPath);
          }}
          renderInput={(params) => (
            <TextField label="Property Path" {...params} variant="outlined" />
          )}
        />
        <Select value={operator.id} onChange={handleOperatorChange}>
          <MenuItem value={SegmentOperatorType.Equals}>
            {keyedOperatorOptions[SegmentOperatorType.Equals].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.Exists}>
            {keyedOperatorOptions[SegmentOperatorType.Exists].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.GreaterThanOrEqual}>
            {keyedOperatorOptions[SegmentOperatorType.GreaterThanOrEqual].label}
          </MenuItem>
          <MenuItem value={SegmentOperatorType.LessThan}>
            {keyedOperatorOptions[SegmentOperatorType.LessThan].label}
          </MenuItem>
        </Select>
        {operatorEl}
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

  const handleKeyChange = (newKey: string) => {
    updateSegmentNodeData(node.id, (n) => {
      if (n.type === SegmentNodeType.KeyedPerformed) {
        n.key = newKey;
      }
    });
  };
  const keySelector = (
    <Autocomplete
      value={node.key}
      disabled={disabled}
      freeSolo
      sx={{ width: selectorWidth }}
      options={properties[node.event] ?? []}
      onInputChange={(_event, newKey) => {
        if (newKey === undefined || newKey === null) {
          return;
        }
        handleKeyChange(newKey);
      }}
      renderInput={(params) => (
        <TextField label="Property Key Path" {...params} variant="outlined" />
      )}
    />
  );

  return (
    <Stack direction="column" spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Autocomplete
          value={node.event}
          disabled={disabled}
          freeSolo
          sx={{ width: selectorWidth }}
          options={Object.keys(properties)}
          onInputChange={(_event, newPath) => {
            if (newPath === undefined || newPath === null) {
              return;
            }
            handleEventNameChange(newPath);
          }}
          renderInput={(params) => (
            <TextField label="Event Name" {...params} variant="outlined" />
          )}
        />
        {keySelector}
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
      </Stack>
      {propertyRows?.length ? <SubtleHeader>Properties</SubtleHeader> : null}
      {propertyRows}
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
  const { disabled } = useContext(SegmentEditorContext);

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
  const { disabled } = useContext(SegmentEditorContext);
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
  const { disabled } = useContext(SegmentEditorContext);

  const traits = useAppStore((store) => store.traits);
  const operator = keyedOperatorOptions[node.operator.type];
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
    case SegmentOperatorType.HasBeen: {
      const comparatorOption =
        keyedHasBeenComparatorOptions[node.operator.comparator];

      const comparatorSelect = (
        <Box sx={{ width: secondarySelectorWidth }}>
          <Autocomplete
            value={comparatorOption}
            disabled={disabled}
            disableClearable
            options={hasBeenComparatorOptions}
            onChange={(_event, newValue) => {
              updateSegmentNodeData(node.id, (segmentNode) => {
                if (
                  segmentNode.type === SegmentNodeType.Trait &&
                  segmentNode.operator.type === SegmentOperatorType.HasBeen
                ) {
                  segmentNode.operator.comparator = newValue.id;
                }
              });
            }}
            renderInput={(params) => (
              <TextField label="Comparator" {...params} variant="outlined" />
            )}
          />
        </Box>
      );
      valueSelect = (
        <>
          <ValueSelect nodeId={node.id} operator={node.operator} />
          {comparatorSelect}
          <DurationValueSelect nodeId={node.id} operator={node.operator} />
        </>
      );
      break;
    }
    case SegmentOperatorType.NotEquals: {
      valueSelect = <ValueSelect nodeId={node.id} operator={node.operator} />;
      break;
    }
    case SegmentOperatorType.Exists: {
      valueSelect = null;
      break;
    }
    case SegmentOperatorType.NotExists: {
      valueSelect = null;
      break;
    }
    case SegmentOperatorType.LessThan: {
      valueSelect = (
        <NumericValueSelect nodeId={node.id} operator={node.operator} />
      );
      break;
    }
    case SegmentOperatorType.GreaterThanOrEqual: {
      valueSelect = (
        <NumericValueSelect nodeId={node.id} operator={node.operator} />
      );
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
        <TraitAutocomplete
          traitPath={traitPath}
          traitOnChange={traitOnChange}
          disabled={disabled}
          traits={traits}
        />
      </Box>
      <Box sx={{ width: secondarySelectorWidth }}>
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
                  case SegmentOperatorType.NotExists: {
                    nodeOperator = {
                      type: SegmentOperatorType.NotExists,
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
                  case SegmentOperatorType.LessThan: {
                    nodeOperator = {
                      type: SegmentOperatorType.LessThan,
                      value: 0,
                    };
                    break;
                  }
                  case SegmentOperatorType.GreaterThanOrEqual: {
                    nodeOperator = {
                      type: SegmentOperatorType.GreaterThanOrEqual,
                      value: 0,
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
          options={traitOperatorOptions}
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

interface ManualUploadState {
  operation: ManualSegmentOperationEnum;
}

function RandomBucketSelect({ node }: { node: RandomBucketSegmentNode }) {
  const { updateEditableSegmentNodeData } = useAppStorePick([
    "updateEditableSegmentNodeData",
  ]);
  const { disabled } = useContext(SegmentEditorContext);
  const handlePercentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;

    updateEditableSegmentNodeData(node.id, (segmentNode) => {
      if (segmentNode.type !== SegmentNodeType.RandomBucket) {
        return;
      }
      const percent = parseFloat(newValue);
      if (Number.isNaN(percent)) {
        return;
      }
      const adjustedPercent = percent / 100;
      if (adjustedPercent < 0 || adjustedPercent > 1) {
        return;
      }
      segmentNode.percent = adjustedPercent;
    });
  };
  const percentString = useMemo(() => {
    const roundedPercent = round(node.percent * 100, 1);
    return String(roundedPercent);
  }, [node.percent]);
  return (
    <TextField
      disabled={disabled}
      label="To be included in bucket."
      InputProps={{
        type: "number",
        endAdornment: "%",
      }}
      value={percentString}
      onChange={handlePercentChange}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ManualNodeComponent({ node }: { node: ManualSegmentNode }) {
  const { disabled } = useContext(SegmentEditorContext);
  const { workspace, editedSegment, apiBase } = useAppStorePick([
    "workspace",
    "editedSegment",
    "apiBase",
  ]);
  const [{ operation }] = useImmer<ManualUploadState>({
    operation: ManualSegmentOperationEnum.Add,
  });

  const handleSubmit = useCallback(
    async ({ data }: { data: FormData }) => {
      if (workspace.type !== CompletionStatus.Successful || !editedSegment) {
        return;
      }

      await axios({
        method: "PUT",
        url: `${apiBase}/api/segments`,
        data: editedSegment,
        headers: {
          "Content-Type": "application/json",
        },
      });

      await axios({
        method: "POST",
        url: `${apiBase}/api/segments/upload-csv`,
        data,
        headers: {
          [WORKSPACE_ID_HEADER]: workspace.value.id,
          [SEGMENT_ID_HEADER]: editedSegment.id,
          operation,
        } satisfies ManualSegmentUploadCsvHeaders,
      });
    },
    [apiBase, editedSegment, operation, workspace],
  );
  return (
    <Stack direction="column" spacing={3}>
      <SubtleHeader>Upload CSV for Manual Segment</SubtleHeader>
      <CsvUploader
        disabled={disabled}
        submit={handleSubmit}
        successMessage="Uploaded CSV to manual segment"
        errorMessage="API Error: Failed upload CSV to manual segment"
      />
    </Stack>
  );
}

function SegmentNodeComponent({
  node,
  label,
  renderDelete,
  parentId,
  isRoot = false,
}: {
  node: SegmentNode;
  isRoot?: boolean;
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
  const { disabled } = useContext(SegmentEditorContext);
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
  const segmentOptions = useMemo(
    () =>
      SEGMENT_OPTIONS.filter(
        (opt) =>
          isRoot ||
          (opt.id !== SegmentNodeType.Manual &&
            opt.id !== SegmentNodeType.KeyedPerformed &&
            opt.id !== SegmentNodeType.Everyone),
      ),
    [isRoot],
  );

  if (node.type === SegmentNodeType.Broadcast) {
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
  } else if (node.type === SegmentNodeType.LastPerformed) {
    el = (
      <Stack direction="row" spacing={1}>
        {labelEl}
        {conditionSelect}
        <LastPerformedSelect node={node} />
        {deleteButton}
      </Stack>
    );
  } else if (node.type === SegmentNodeType.Manual) {
    el = (
      <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
        {labelEl}
        {conditionSelect}
        <ManualNodeComponent node={node} />
      </Stack>
    );
  } else if (node.type === SegmentNodeType.RandomBucket) {
    el = (
      <Stack direction="row" spacing={1}>
        {labelEl}
        {conditionSelect}
        <RandomBucketSelect node={node} />
        {deleteButton}
      </Stack>
    );
  } else if (node.type === SegmentNodeType.KeyedPerformed) {
    el = (
      <Stack direction="row" spacing={1}>
        {labelEl}
        {conditionSelect}
        <KeyedPerformedSelect node={node} />
        {deleteButton}
      </Stack>
    );
  } else if (node.type === SegmentNodeType.Email) {
    el = (
      <Stack direction="row" spacing={1}>
        {labelEl}
        {conditionSelect}
        <EmailSelect node={node} />
        {deleteButton}
      </Stack>
    );
  } else if (node.type === SegmentNodeType.Everyone) {
    el = (
      <Stack direction="row" spacing={1}>
        {labelEl}
        {conditionSelect}
      </Stack>
    );
  } else {
    assertUnreachable(node);
  }

  return <>{el}</>;
}

export function SegmentEditorInner({
  sx,
  disabled,
  segmentId,
}: {
  sx?: SxProps;
  disabled?: boolean;
  segmentId: string;
}) {
  const theme = useTheme();
  const { data: segment, isError, isPending } = useSegmentQuery(segmentId);

  useLoadTraits();
  useLoadProperties();

  const [contextValue, setContextValue] = useImmer<
    SegmentEditorContextType | undefined
  >(
    segment
      ? {
          disabled,
          editedSegment: segment,
        }
      : undefined,
  );

  useEffect(() => {
    if (segment) {
      setContextValue({
        disabled,
        editedSegment: segment,
      });
    }
  }, [disabled, segment, setContextValue]);

  if (!segment || isError || isPending) {
    return null;
  }

  const { entryNode } = segment.definition;

  return (
    <SegmentEditorContext.Provider value={contextValue}>
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
        <SegmentNodeComponent
          node={entryNode}
          isRoot
          renderDelete={false}
          label="empty"
        />
      </Box>
    </SegmentEditorContext.Provider>
  );
}

export default function SegmentEditor({
  disabled,
  segmentId,
}: {
  disabled?: boolean;
  segmentId: string;
}) {
  // FIXME refactor to get rid of this
  return <SegmentEditorInner disabled={disabled} segmentId={segmentId} />;
}
