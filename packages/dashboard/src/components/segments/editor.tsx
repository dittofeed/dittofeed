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
  Typography,
  useTheme,
} from "@mui/material";
import { CalendarDate } from "@internationalized/date";
import { Draft } from "immer";
import { format, parse } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { isEmailEvent } from "isomorphic-lib/src/email";
import { round } from "isomorphic-lib/src/numbers";
import {
  getNewManualSegmentVersion,
  isBodySegmentNode,
} from "isomorphic-lib/src/segments";
import { assertUnreachable } from "isomorphic-lib/src/typeAssertions";
import {
  BodySegmentNode,
  ChannelType,
  CompletionStatus,
  CursorDirectionEnum,
  EmailSegmentNode,
  InternalEventType,
  KeyedPerformedPropertiesOperator,
  KeyedPerformedSegmentNode,
  LastPerformedSegmentNode,
  ManualSegmentNode,
  PerformedSegmentNode,
  RandomBucketSegmentNode,
  RelationalOperators,
  SegmentAbsoluteTimestampOperator,
  SegmentDefinition,
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
  SubscriptionGroupType,
  TraitSegmentNode,
} from "isomorphic-lib/src/types";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Updater, useImmer } from "use-immer";
import { v4 as uuid } from "uuid";

import { useAppStorePick } from "../../lib/appStore";
import { toCalendarDate } from "../../lib/dates";
import { GroupedOption } from "../../lib/types";
import { useSegmentQuery } from "../../lib/useSegmentQuery";
import { useUploadCsvMutation } from "../../lib/useUploadCsvMutation";
import { CsvUploader } from "../csvUploader";
import DurationSelect from "../durationSelect";
import {
  EventNamesAutocomplete,
  PropertiesAutocomplete,
} from "../eventsAutocomplete";
import { SubtleHeader } from "../headers";
import InfoTooltip from "../infoTooltip";
import { MessageTemplateAutocomplete } from "../messageTemplateAutocomplete";
import { SubscriptionGroupAutocompleteV2 } from "../subscriptionGroupAutocomplete";
import TraitAutocomplete from "../traitAutocomplete";

type SegmentGroupedOption = GroupedOption<SegmentNodeType>;

const selectorWidth = "192px";
const secondarySelectorWidth = "128px";

interface SegmentEditorState {
  disabled?: boolean;
  editedSegment: SegmentResource;
}

interface SegmentEditorContextType {
  state: SegmentEditorState;
  setState: Updater<SegmentEditorState>;
}

const SegmentEditorContext = React.createContext<
  SegmentEditorContextType | undefined
>(undefined);

function updateEditableSegmentNodeData(
  setState: Updater<SegmentEditorState>,
  nodeId: string,
  updateNode: (currentValue: Draft<SegmentNode>) => void,
) {
  setState((draft) => {
    const { definition } = draft.editedSegment;
    const node =
      nodeId === definition.entryNode.id
        ? definition.entryNode
        : definition.nodes.find((n) => n.id === nodeId);

    if (!node) {
      return draft;
    }
    updateNode(node);
    return draft;
  });
}

function mapSegmentNodeToNewType(
  node: SegmentNode,
  type: SegmentNodeType,
): { primary: SegmentNode; secondary: BodySegmentNode[] } {
  switch (type) {
    case SegmentNodeType.And: {
      let children: string[];
      let secondary: BodySegmentNode[];

      if (node.type === SegmentNodeType.Or) {
        children = node.children;
        secondary = [];
      } else {
        const child: SegmentNode = {
          type: SegmentNodeType.Trait,
          id: uuid(),
          path: "",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "",
          },
        };

        children = [child.id];
        secondary = [child];
      }

      return {
        primary: {
          type: SegmentNodeType.And,
          id: node.id,
          children,
        },
        secondary,
      };
    }
    case SegmentNodeType.Or: {
      let children: string[];
      let secondary: BodySegmentNode[];

      if (node.type === SegmentNodeType.And) {
        children = node.children;
        secondary = [];
      } else {
        const child: SegmentNode = {
          type: SegmentNodeType.Trait,
          id: uuid(),
          path: "",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "",
          },
        };

        children = [child.id];
        secondary = [child];
      }

      return {
        primary: {
          type: SegmentNodeType.Or,
          id: node.id,
          children,
        },
        secondary,
      };
    }
    case SegmentNodeType.Trait: {
      return {
        primary: {
          type: SegmentNodeType.Trait,
          id: node.id,
          path: "",
          operator: {
            type: SegmentOperatorType.Equals,
            value: "",
          },
        },
        secondary: [],
      };
    }
    case SegmentNodeType.Broadcast: {
      return {
        primary: {
          type: SegmentNodeType.Broadcast,
          id: node.id,
        },
        secondary: [],
      };
    }
    case SegmentNodeType.SubscriptionGroup: {
      return {
        primary: {
          type: SegmentNodeType.SubscriptionGroup,
          id: node.id,
          subscriptionGroupId: "",
          subscriptionGroupType: SubscriptionGroupType.OptIn,
        },
        secondary: [],
      };
    }
    case SegmentNodeType.Performed: {
      return {
        primary: {
          type: SegmentNodeType.Performed,
          id: node.id,
          event: "",
          times: 1,
          timesOperator: RelationalOperators.GreaterThanOrEqual,
        },
        secondary: [],
      };
    }
    case SegmentNodeType.Email: {
      return {
        primary: {
          type: SegmentNodeType.Email,
          id: node.id,
          templateId: "",
          event: InternalEventType.MessageSent,
        },
        secondary: [],
      };
    }
    case SegmentNodeType.Manual: {
      return {
        primary: {
          type: SegmentNodeType.Manual,
          version: getNewManualSegmentVersion(Date.now()),
          id: node.id,
        },
        secondary: [],
      };
    }
    case SegmentNodeType.RandomBucket: {
      return {
        primary: {
          type: SegmentNodeType.RandomBucket,
          id: node.id,
          percent: 0.5,
        },
        secondary: [],
      };
    }
    case SegmentNodeType.KeyedPerformed: {
      return {
        primary: {
          type: SegmentNodeType.KeyedPerformed,
          timesOperator: RelationalOperators.GreaterThanOrEqual,
          id: node.id,
          event: "",
          key: "",
        },
        secondary: [],
      };
    }
    case SegmentNodeType.LastPerformed: {
      return {
        primary: {
          type: SegmentNodeType.LastPerformed,
          id: node.id,
          event: "",
        },
        secondary: [],
      };
    }
    case SegmentNodeType.Everyone: {
      return {
        primary: {
          type: SegmentNodeType.Everyone,
          id: node.id,
        },
        secondary: [],
      };
    }
    default: {
      assertUnreachable(type);
    }
  }
}

function removeOrphanedSegmentNodes(segmentDefinition: SegmentDefinition) {
  const nonOrphanNodes = new Set<string>();
  const nodesById = new Map<string, SegmentNode>();
  for (const node of segmentDefinition.nodes) {
    nodesById.set(node.id, node);
  }

  const currentNodes: SegmentNode[] = [segmentDefinition.entryNode];

  while (currentNodes.length) {
    const currentNode = currentNodes.pop();
    if (currentNode) {
      nonOrphanNodes.add(currentNode.id);

      if (
        currentNode.type === SegmentNodeType.And ||
        currentNode.type === SegmentNodeType.Or
      ) {
        for (const childId of currentNode.children) {
          const child = nodesById.get(childId);
          if (child) {
            currentNodes.push(child);
          }
        }
      }
    }
  }

  segmentDefinition.nodes = segmentDefinition.nodes.filter((n) =>
    nonOrphanNodes.has(n.id),
  );
}

function updateEditableSegmentNodeType(
  setState: Updater<SegmentEditorState>,
  nodeId: string,
  nodeType: SegmentNodeType,
) {
  setState((draft) => {
    const { definition } = draft.editedSegment;
    // update entry node
    if (nodeId === definition.entryNode.id) {
      const node = definition.entryNode;
      // No need to update node, already desired type
      if (node.type === nodeType) {
        return draft;
      }
      const newType = mapSegmentNodeToNewType(node, nodeType);
      definition.entryNode = newType.primary;
      definition.nodes = newType.secondary.concat(definition.nodes);
      // update body node
    } else {
      definition.nodes.forEach((node) => {
        if (node.id !== nodeId) {
          return;
        }

        // No need to update node, already desired type
        if (node.type === nodeType) {
          return;
        }

        const newType = mapSegmentNodeToNewType(node, nodeType);
        const { primary } = newType;
        if (!isBodySegmentNode(primary)) {
          console.error(
            `Unexpected segment node type ${nodeType} for body node.`,
          );
          return;
        }

        definition.nodes = newType.secondary.concat(definition.nodes);
        definition.nodes = definition.nodes.map((n) =>
          n.id === nodeId ? primary : n,
        );
      });
    }

    removeOrphanedSegmentNodes(definition);
    return draft;
  });
}

function addEditableSegmentChild(
  setState: Updater<SegmentEditorState>,
  parentId: string,
) {
  setState((draft) => {
    const { definition } = draft.editedSegment;
    const parent =
      parentId === definition.entryNode.id
        ? definition.entryNode
        : definition.nodes.find((n) => n.id === parentId);

    if (
      !parent ||
      !(
        parent.type === SegmentNodeType.And ||
        parent.type === SegmentNodeType.Or
      )
    ) {
      return draft;
    }

    const child: SegmentNode = {
      type: SegmentNodeType.Trait,
      id: uuid(),
      path: "",
      operator: {
        type: SegmentOperatorType.Equals,
        value: "",
      },
    };
    parent.children.push(child.id);
    definition.nodes.push(child);
    return draft;
  });
}

function removeEditableSegmentChild(
  setState: Updater<SegmentEditorState>,
  parentId: string,
  nodeId: string,
) {
  setState((draft) => {
    const { definition } = draft.editedSegment;
    const parent =
      parentId === definition.entryNode.id
        ? definition.entryNode
        : definition.nodes.find((n) => n.id === parentId);

    if (
      !parent ||
      !(
        parent.type === SegmentNodeType.And ||
        parent.type === SegmentNodeType.Or
      )
    ) {
      return draft;
    }

    parent.children = parent.children.filter((c) => c !== nodeId);
    definition.nodes = definition.nodes.filter((n) => n.id !== nodeId);
    removeOrphanedSegmentNodes(definition);
    return draft;
  });
}

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

const absoluteTimestampOperatorOption = {
  id: SegmentOperatorType.AbsoluteTimestamp,
  label: "Absolute Timestamp",
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
  absoluteTimestampOperatorOption,
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
  [SegmentOperatorType.AbsoluteTimestamp]: absoluteTimestampOperatorOption,
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
  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateEditableSegmentNodeData(setState, nodeId, (node) => {
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
        InputLabelProps={{
          shrink: true,
        }}
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
  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateEditableSegmentNodeData(setState, nodeId, (node) => {
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
        InputLabelProps={{
          shrink: true,
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

  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;

  const handleChange = (seconds: number) => {
    updateEditableSegmentNodeData(setState, nodeId, (node) => {
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
      disabled={disabled}
      timeFieldSx={{ width: secondarySelectorWidth }}
      onChange={handleChange}
      inputLabel="Time Value"
    />
  );
}

function LastPerformedSelect({ node }: { node: LastPerformedSegmentNode }) {
  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;

  const handleEventNameChange = (newEvent: string) => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
      if (n.type === SegmentNodeType.LastPerformed) {
        n.event = newEvent;
      }
    });
  };

  const handleAddHasProperty = () => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
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
    updateEditableSegmentNodeData(setState, node.id, (n) => {
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
          />
        );
        break;
      }
      case SegmentOperatorType.NotEquals: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
          />
        );
        break;
      }
      case SegmentOperatorType.GreaterThanOrEqual: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
          />
        );
        break;
      }
      case SegmentOperatorType.LessThan: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
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
        <PropertiesAutocomplete
          event={node.event}
          property={property.path}
          onPropertyChange={handlePropertyPathChange}
          sx={{ width: selectorWidth }}
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
          />
        );
        break;
      }
      case SegmentOperatorType.NotEquals: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
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
        <PropertiesAutocomplete
          event={node.event}
          property={property.path}
          onPropertyChange={handlePropertyPathChange}
          sx={{ width: selectorWidth }}
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
        <EventNamesAutocomplete
          event={node.event}
          onEventChange={handleEventNameChange}
          sx={{ width: selectorWidth }}
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
  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;

  const handleEventNameChange = (newEvent: string) => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
      if (n.type === SegmentNodeType.Performed) {
        n.event = newEvent;
      }
    });
  };

  const handleTimesOperatorChange: SelectProps["onChange"] = (e) => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
      if (n.type === SegmentNodeType.Performed) {
        n.timesOperator = e.target.value as RelationalOperators;
      }
    });
  };

  const handleEventTimesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
      const times = parseInt(e.target.value, 10);
      if (n.type === SegmentNodeType.Performed && !Number.isNaN(times)) {
        n.times = times;
      }
    });
  };

  const handleAddProperty = () => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
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
    updateEditableSegmentNodeData(setState, node.id, (n) => {
      if (n.type === SegmentNodeType.Performed) {
        n.withinSeconds = n.withinSeconds ?? 5 * 60;
      }
    });
  };

  const propertyRows = node.properties?.map((property, i) => {
    const handlePropertyPathChange = (newPath: string) => {
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
          />
        );
        break;
      }
      case SegmentOperatorType.GreaterThanOrEqual: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
          />
        );
        break;
      }
      case SegmentOperatorType.LessThan: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
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
        <PropertiesAutocomplete
          event={node.event}
          property={property.path}
          onPropertyChange={handlePropertyPathChange}
          sx={{ width: selectorWidth }}
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
              updateEditableSegmentNodeData(setState, node.id, (n) => {
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
              updateEditableSegmentNodeData(setState, node.id, (n) => {
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
        <EventNamesAutocomplete
          event={node.event}
          onEventChange={handleEventNameChange}
          sx={{ width: selectorWidth }}
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
  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;

  const handleEventNameChange = (newEvent: string) => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
      if (n.type === SegmentNodeType.KeyedPerformed) {
        n.event = newEvent;
      }
    });
  };

  const handleTimesOperatorChange: SelectProps["onChange"] = (e) => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
      if (n.type === SegmentNodeType.KeyedPerformed) {
        n.timesOperator = e.target.value as RelationalOperators;
      }
    });
  };

  const handleEventTimesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
      const times = parseInt(e.target.value, 10);
      if (n.type === SegmentNodeType.KeyedPerformed && !Number.isNaN(times)) {
        n.times = times;
      }
    });
  };

  const handleAddProperty = () => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
      updateEditableSegmentNodeData(setState, node.id, (n) => {
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
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
          />
        );
        break;
      }
      case SegmentOperatorType.NotEquals: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateEditableSegmentNodeData(setState, node.id, (n) => {
            if (n.type === SegmentNodeType.KeyedPerformed) {
              const newValue = e.target.value;
              const existingProperty = n.properties?.[i];
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
            value={propertyOperator.value}
            InputLabelProps={{
              shrink: true,
            }}
          />
        );
        break;
      }
      case SegmentOperatorType.GreaterThanOrEqual: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
          />
        );
        break;
      }
      case SegmentOperatorType.LessThan: {
        const handlePropertyValueChange = (
          e: React.ChangeEvent<HTMLInputElement>,
        ) => {
          updateEditableSegmentNodeData(setState, node.id, (n) => {
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
            InputLabelProps={{
              shrink: true,
            }}
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
        <PropertiesAutocomplete
          event={node.event}
          property={property.path}
          onPropertyChange={handlePropertyPathChange}
          sx={{ width: selectorWidth }}
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
    updateEditableSegmentNodeData(setState, node.id, (n) => {
      if (n.type === SegmentNodeType.KeyedPerformed) {
        n.key = newKey;
      }
    });
  };
  const keySelector = (
    <PropertiesAutocomplete
      property={node.key}
      event={node.event}
      disabled={disabled}
      label="Property Key Path"
      onPropertyChange={handleKeyChange}
      sx={{ width: selectorWidth }}
    />
  );

  return (
    <Stack direction="column" spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <EventNamesAutocomplete
          event={node.event}
          onEventChange={handleEventNameChange}
          sx={{ width: selectorWidth }}
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
  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;

  const onEmailEventChangeHandler: SelectProps["onChange"] = (e) => {
    updateEditableSegmentNodeData(setState, node.id, (n) => {
      const event = e.target.value;
      if (n.type === SegmentNodeType.Email && isEmailEvent(event)) {
        n.event = event;
      }
    });
  };

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
        <MessageTemplateAutocomplete
          messageTemplateId={node.templateId}
          label="Email Template"
          disabled={disabled}
          handler={(newValue) => {
            updateEditableSegmentNodeData(setState, node.id, (segmentNode) => {
              if (segmentNode.type === SegmentNodeType.Email && newValue?.id) {
                segmentNode.templateId = newValue.id;
              }
            });
          }}
          channel={ChannelType.Email}
        />
      </Box>
    </Stack>
  );
}

function SubscriptionGroupSelect({
  node,
}: {
  node: SubscriptionGroupSegmentNode;
}) {
  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;

  return (
    <Box sx={{ width: selectorWidth }}>
      <SubscriptionGroupAutocompleteV2
        disabled={disabled}
        subscriptionGroupId={node.subscriptionGroupId}
        handler={(newValue) => {
          updateEditableSegmentNodeData(setState, node.id, (segmentNode) => {
            if (
              newValue &&
              segmentNode.type === SegmentNodeType.SubscriptionGroup
            ) {
              segmentNode.subscriptionGroupId = newValue.id;
            }
          });
        }}
      />
    </Box>
  );
}

function AbsoluteTimestampValueSelect({
  nodeId,
  operator,
}: {
  nodeId: string;
  operator: SegmentAbsoluteTimestampOperator;
}) {
  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;
  
  // Get user's current timezone
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Convert ISO string to datetime-local format in user's timezone
  const dateTimeLocalValue = operator.absoluteTimestamp 
    ? formatInTimeZone(new Date(operator.absoluteTimestamp), userTimezone, "yyyy-MM-dd'T'HH:mm:ss")
    : "";

  const handleDateTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateTimeLocalValue = e.target.value;
    if (!dateTimeLocalValue) return;
    
    // datetime-local input provides a string like "2024-01-15T14:30:00"
    // This represents the local time in the user's timezone
    // We need to create a Date object that represents this exact moment in the user's timezone
    const date = new Date(dateTimeLocalValue);
    
    updateEditableSegmentNodeData(setState, nodeId, (node) => {
      if (
        node.type === SegmentNodeType.Trait &&
        node.operator.type === SegmentOperatorType.AbsoluteTimestamp
      ) {
        // Store as ISO string (UTC) - Date.toISOString() automatically converts to UTC
        node.operator.absoluteTimestamp = date.toISOString();
      }
    });
  };

  const handleDirectionChange = (e: SelectChangeEvent<CursorDirectionEnum>) => {
    updateEditableSegmentNodeData(setState, nodeId, (node) => {
      if (
        node.type === SegmentNodeType.Trait &&
        node.operator.type === SegmentOperatorType.AbsoluteTimestamp
      ) {
        node.operator.direction = e.target.value as CursorDirectionEnum;
      }
    });
  };

  return (
    <>
      <Stack direction="column" spacing={1} sx={{ width: selectorWidth }}>
        <TextField
          disabled={disabled}
          label="Date & Time"
          type="datetime-local"
          value={dateTimeLocalValue}
          onChange={handleDateTimeChange}
          InputLabelProps={{
            shrink: true,
          }}
          inputProps={{
            step: 1, // Allow seconds precision
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
          {userTimezone}
        </Typography>
      </Stack>
      
      <Box sx={{ width: secondarySelectorWidth }}>
        <Select
          disabled={disabled}
          value={operator.direction}
          onChange={handleDirectionChange}
          displayEmpty
        >
          <MenuItem value={CursorDirectionEnum.After}>After</MenuItem>
          <MenuItem value={CursorDirectionEnum.Before}>Before</MenuItem>
        </Select>
      </Box>
    </>
  );
}

function TraitSelect({ node }: { node: TraitSegmentNode }) {
  const traitPath = node.path;
  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;

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
              updateEditableSegmentNodeData(
                setState,
                node.id,
                (segmentNode) => {
                  if (
                    segmentNode.type === SegmentNodeType.Trait &&
                    segmentNode.operator.type === SegmentOperatorType.HasBeen
                  ) {
                    segmentNode.operator.comparator = newValue.id;
                  }
                },
              );
            }}
            renderInput={(params) => (
              <TextField
                label="Comparator"
                {...params}
                variant="outlined"
                InputLabelProps={{
                  shrink: true,
                }}
              />
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
    case SegmentOperatorType.AbsoluteTimestamp: {
      valueSelect = (
        <AbsoluteTimestampValueSelect nodeId={node.id} operator={node.operator} />
      );
      break;
    }
    default: {
      assertUnreachable(node.operator);
    }
  }

  const traitOnChange = (newValue: string) => {
    updateEditableSegmentNodeData(setState, node.id, (segmentNode) => {
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
          sx={{ width: selectorWidth }}
        />
      </Box>
      <Box sx={{ width: secondarySelectorWidth }}>
        <Autocomplete
          value={operator}
          disabled={disabled}
          onChange={(_event: unknown, newValue: Option) => {
            updateEditableSegmentNodeData(setState, node.id, (segmentNode) => {
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
                  case SegmentOperatorType.AbsoluteTimestamp: {
                    nodeOperator = {
                      type: SegmentOperatorType.AbsoluteTimestamp,
                      absoluteTimestamp: new Date().toISOString(),
                      direction: CursorDirectionEnum.After,
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
            <TextField
              label="Operator"
              {...params}
              variant="outlined"
              InputLabelProps={{
                shrink: true,
              }}
            />
          )}
        />
      </Box>
      {valueSelect}
    </>
  );
}

type Label = Group | "empty";

function RandomBucketSelect({ node }: { node: RandomBucketSegmentNode }) {
  const { state, setState } = useSegmentEditorContext();
  const { disabled } = state;
  const handlePercentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;

    updateEditableSegmentNodeData(setState, node.id, (segmentNode) => {
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
      InputLabelProps={{
        shrink: true,
      }}
    />
  );
}

function ManualNodeComponent({ node: _node }: { node: ManualSegmentNode }) {
  const { state } = useSegmentEditorContext();
  const { disabled } = state;
  const { workspace } = useAppStorePick(["workspace"]);
  const { mutateAsync, isPending: isUploading } = useUploadCsvMutation();

  const handleSubmit = useCallback(
    async ({ data }: { data: FormData }) => {
      if (workspace.type !== CompletionStatus.Successful) {
        return;
      }
      // TODO handle error and success states from mutateAsync
      await mutateAsync({
        segmentId: state.editedSegment.id,
        data,
      });
    },
    [workspace, state.editedSegment.id, mutateAsync],
  );
  return (
    <Stack direction="column" spacing={3}>
      <SubtleHeader>Upload CSV for Manual Segment</SubtleHeader>
      <CsvUploader
        disabled={disabled || isUploading}
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
  const { state, setState } = useSegmentEditorContext();
  const { disabled, editedSegment } = state;
  const nodeById = useMemo(
    () =>
      editedSegment.definition.nodes.reduce<Record<string, SegmentNode>>(
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
          updateEditableSegmentNodeType(setState, node.id, newValue.id);
        }}
        disableClearable
        options={segmentOptions}
        disabled={disabled}
        renderInput={(params) => (
          <TextField
            label="Condition or Group"
            {...params}
            InputLabelProps={{
              ...params.InputLabelProps,
              shrink: true,
            }}
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
        onClick={() => removeEditableSegmentChild(setState, parentId, node.id)}
      >
        <Delete />
      </IconButton>
    ) : null;

  const labelEl = (
    <Box sx={{ paddingLeft: 2, paddingRight: 2 }}>
      <Typography
        sx={{
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
            onClick={() => addEditableSegmentChild(setState, node.id)}
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

export interface SegmentEditorProps {
  sx?: SxProps;
  disabled?: boolean;
  segmentId: string;
  onSegmentChange?: (segment: SegmentResource) => void;
}

export default function SegmentEditor({
  sx,
  disabled,
  segmentId,
  onSegmentChange,
}: SegmentEditorProps) {
  const theme = useTheme();
  const { data: segment, isError, isPending } = useSegmentQuery(segmentId);

  const [state, setState] = useImmer<SegmentEditorState | null>(
    segment
      ? {
          disabled,
          editedSegment: segment,
        }
      : null,
  );

  const prevEditedSegmentRef = useRef<SegmentResource | null>(null);

  // Call onSegmentChange only if the segment has changed from a non-null value to another non-null value
  useEffect(() => {
    const currentSegment = state?.editedSegment;
    const prevSegment = prevEditedSegmentRef.current;

    // Call only if changed from a non-null value to another non-null value
    if (currentSegment && prevSegment && currentSegment !== prevSegment) {
      onSegmentChange?.(currentSegment);
    }

    // Update the ref to store the current segment for the next render
    prevEditedSegmentRef.current = currentSegment ?? null;
  }, [state?.editedSegment, onSegmentChange]);

  useEffect(() => {
    if (segment && state === null) {
      setState({
        editedSegment: segment,
      });
    }
  }, [segment, setState, state]);

  const contextValue: SegmentEditorContextType | null = useMemo(() => {
    if (!state) {
      return null;
    }
    const setNonNullState: Updater<SegmentEditorState> = (update) => {
      setState((draft) => {
        if (draft === null) {
          return draft;
        }
        const newState = typeof update === "function" ? update(draft) : update;
        return newState;
      });
    };

    return {
      state,
      setState: setNonNullState,
    };
  }, [state, setState]);

  if (!segment || isError || isPending || !contextValue || !state) {
    return null;
  }

  const { entryNode } = state.editedSegment.definition;

  return (
    <SegmentEditorContext.Provider value={contextValue}>
      <Box
        sx={{
          paddingTop: 3,
          paddingBottom: 3,
          borderRadius: 1,
          border: `1px solid ${theme.palette.grey[300]}`,
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
