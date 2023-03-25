import { PlusCircleFilled } from "@ant-design/icons";
import { Delete } from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { findAllUserTraits } from "backend-lib/src/userEvents";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  SegmentDefinition,
  SegmentEqualsOperator,
  SegmentHasBeenOperator,
  SegmentHasBeenOperatorComparator,
  SegmentNode,
  SegmentNodeType,
  SegmentOperator,
  SegmentOperatorType,
  SegmentResource,
  SegmentWithinOperator,
  TraitSegmentNode,
  TraitUserPropertyDefinition,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import React, { useMemo } from "react";
import { validate } from "uuid";

import DurationDescription from "../../../components/durationDescription";
import EditableName from "../../../components/editableName";
import MainLayout from "../../../components/mainLayout";
import apiRequestHandlerFactory from "../../../lib/apiRequestHandlerFactory";
import {
  addInitialStateToProps,
  PreloadedState,
  PropsWithInitialState,
  useAppStore,
} from "../../../lib/appStore";
import prisma from "../../../lib/prisma";

interface GroupedOption {
  id: SegmentNodeType;
  group: string;
  label: string;
}

const selectorWith = "150px";

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

const segmentOptions: GroupedOption[] = [
  traitGroupedOption,
  andGroupedOption,
  orGroupedOption,
];

const keyedSegmentOptions: Record<SegmentNodeType, GroupedOption> = {
  [SegmentNodeType.Trait]: traitGroupedOption,
  [SegmentNodeType.And]: andGroupedOption,
  [SegmentNodeType.Or]: orGroupedOption,
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

const keyedOperatorOptions: Record<SegmentOperatorType, Option> = {
  [SegmentOperatorType.Equals]: equalsOperatorOption,
  [SegmentOperatorType.Within]: withinOperatorOption,
  [SegmentOperatorType.HasBeen]: hasBeenOperatorOption,
};

type Group = SegmentNodeType.And | SegmentNodeType.Or;

const keyedGroupLabels: Record<Group, string> = {
  [SegmentNodeType.And]: "AND",
  [SegmentNodeType.Or]: "OR",
};

const entryId = "entry";
const initTraitId = "initTraitId";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async (ctx) => {
  const workspaceId = backendConfig().defaultWorkspaceId;
  const serverInitialState: PreloadedState = {};

  const id = ctx.params?.id;

  if (typeof id !== "string" || !validate(id)) {
    return {
      notFound: true,
    };
  }

  const [userProperty, workspace, traits] = await Promise.all([
    prisma().userProperty.findUnique({
      where: {
        id,
      },
    }),
    prisma().workspace.findUnique({
      where: {
        id: workspaceId,
      },
    }),
    findAllUserTraits({
      workspaceId,
    }),
  ]);

  let userPropertyResource: UserPropertyResource;
  if (userProperty) {
    const definition = unwrap(
      schemaValidate(userProperty.definition, UserPropertyDefinition)
    );
    userPropertyResource = {
      id: userProperty.id,
      name: userProperty.name,
      workspaceId,
      definition,
    };
    serverInitialState.userProperties = {
      type: CompletionStatus.Successful,
      value: [userPropertyResource],
    };
  } else {
    userPropertyResource = {
      name: "example",
      id,
      workspaceId,
      definition: {
        type: UserPropertyDefinitionType.Trait,
        path: "example",
      },
    };
  }

  serverInitialState.editedUserProperty = userPropertyResource;

  if (workspace) {
    // TODO PLI-212
    serverInitialState.workspace = {
      type: CompletionStatus.Successful,
      value: {
        id: workspaceId,
        name: workspace.name,
      },
    };
  }

  serverInitialState.traits = {
    type: CompletionStatus.Successful,
    value: traits,
  };

  return {
    props: addInitialStateToProps({}, serverInitialState),
  };
};

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
      <Box sx={{ width: selectorWith }}>
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
      <Box sx={{ width: selectorWith }}>
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

function TraitSelect({ node }: { node: TraitSegmentNode }) {
  const traitPath = node.path;
  const updateSegmentNodeData = useAppStore(
    (state) => state.updateEditableSegmentNodeData
  );

  const traits = useAppStore((store) => store.traits);
  const traitOptions =
    traits.type === CompletionStatus.Successful ? traits.value : [];
  const operator = keyedOperatorOptions[node.operator.type];

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
      <Box sx={{ width: selectorWith }}>
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
      <Box sx={{ width: selectorWith }}>
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
  const condition = keyedSegmentOptions[node.type];
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
  if (!nodeById) {
    return null;
  }

  const conditionSelect = (
    <Box sx={{ width: selectorWith }}>
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

  let el: React.ReactNode;
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
  }
  return <>{el}</>;
}

function TraitUserPropertyDefinitionEditor({
  definition,
}: {
  definition: TraitUserPropertyDefinition;
}) {
  const traits = useAppStore((store) => store.traits);
  const traitOptions =
    traits.type === CompletionStatus.Successful ? traits.value : [];

  const updateUserPropertyDefinition = useAppStore(
    (state) => state.updateUserPropertyDefinition
  );
  const handleTraitChange = (trait: string) => {
    updateUserPropertyDefinition({
      ...definition,
      path: trait,
    });
  };

  return (
    <Autocomplete
      value={definition.path}
      freeSolo
      onChange={(_event, newValue) => {
        handleTraitChange(newValue);
      }}
      disableClearable
      options={traitOptions}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Trait"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = event.target.value;
            handleTraitChange(newValue);
          }}
          InputProps={{
            ...params.InputProps,
            type: "search",
          }}
        />
      )}
    />
  );
}

function UserPropertyDefinitionEditor({
  definition,
}: {
  definition: UserPropertyDefinition;
}) {
  let up;
  switch (definition.type) {
    case UserPropertyDefinitionType.Id:
      up = <>id prop</>;
      break;
    case UserPropertyDefinitionType.AnonymousId:
      up = <>anonymous id prop</>;
      break;
    case UserPropertyDefinitionType.Trait:
      up = <TraitUserPropertyDefinitionEditor definition={definition} />;
      break;
  }
  return <>{up}</>;
}

export default function NewUserProperty() {
  const editedUserProperty = useAppStore((state) => state.editedUserProperty);
  const setName = useAppStore((state) => state.setEditableUserPropertyName);
  const apiBase = useAppStore((state) => state.apiBase);
  const segmentUpdateRequest = useAppStore(
    (state) => state.segmentUpdateRequest
  );
  const setUserPropertyUpdateRequest = useAppStore(
    (state) => state.setUserPropertyUpdateRequest
  );
  const upsertUserProperty = useAppStore((state) => state.upsertUserProperty);
  const theme = useTheme();

  if (!editedUserProperty) {
    return null;
  }
  const { name } = editedUserProperty;

  const handleSave = apiRequestHandlerFactory({
    request: segmentUpdateRequest,
    setRequest: setUserPropertyUpdateRequest,
    responseSchema: UserPropertyResource,
    setResponse: upsertUserProperty,
    requestConfig: {
      method: "PUT",
      url: `${apiBase}/api/user-properties`,
      data: editedUserProperty,
      headers: {
        "Content-Type": "application/json",
      },
    },
  });
  const isProtected = protectedUserProperties.has(editedUserProperty.name);

  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
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
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={isProtected}
              >
                Save
              </Button>
            </Stack>
            <Box
              sx={{
                backgroundColor: "white",
                p: 3,
                borderRadius: 1,
                border: `1px solid ${theme.palette.grey[200]}`,
              }}
            >
              <UserPropertyDefinitionEditor
                definition={editedUserProperty.definition}
              />
            </Box>
          </Stack>
        </MainLayout>
      </main>
    </>
  );
}
