import { DeleteFilled, PlusCircleFilled } from "@ant-design/icons";
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
import axios, { AxiosResponse } from "axios";
import backendConfig from "backend-lib/src/config";
import { findAllUserTraits } from "backend-lib/src/userEvents";
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
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import React, { useMemo } from "react";
import { validate } from "uuid";

import DurationDescription from "../../../components/durationDescription";
import EditableName from "../../../components/editableName";
import MainLayout from "../../../components/mainLayout";
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

  const [segment, workspace, traits] = await Promise.all([
    prisma().segment.findUnique({
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

  let segmentResource: SegmentResource;
  if (segment) {
    const segmentDefinition = unwrap(
      schemaValidate(segment.definition, SegmentDefinition)
    );
    segmentResource = {
      id: segment.id,
      name: segment.name,
      workspaceId,
      definition: segmentDefinition,
    };
  } else {
    segmentResource = {
      name: "My Segment",
      id,
      workspaceId,
      definition: {
        entryNode: {
          type: SegmentNodeType.And,
          children: [initTraitId],
          id: entryId,
        },
        nodes: [
          {
            type: SegmentNodeType.Trait,
            id: initTraitId,
            path: "",
            operator: {
              type: SegmentOperatorType.Equals,
              value: "",
            },
          },
        ],
      },
    };
  }

  serverInitialState.segments = {
    type: CompletionStatus.Successful,
    value: [segmentResource],
  };
  serverInitialState.editedSegment = segmentResource;

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

  return (
    <>
      <Box sx={{ width: selectorWith }}>
        <Autocomplete
          value={traitPath}
          freeSolo
          onChange={(_event: unknown, newValue: string) => {
            updateSegmentNodeData(node.id, (segmentNode) => {
              if (segmentNode.type === SegmentNodeType.Trait) {
                segmentNode.path = newValue;
              }
            });
          }}
          disableClearable
          options={traitOptions}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Trait"
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
        <DeleteFilled />
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

  const handleSave = async () => {
    if (segmentUpdateRequest.type === CompletionStatus.InProgress) {
      return;
    }

    setSegmentUpdateRequest({
      type: CompletionStatus.InProgress,
    });
    let response: AxiosResponse;
    try {
      response = await axios.put(`${apiBase}/api/segments`, editedSegment, {
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      const error = e as Error;

      setSegmentUpdateRequest({
        type: CompletionStatus.Failed,
        error,
      });
      return;
    }
    const parsedResponse = schemaValidate(response.data, SegmentResource);
    if (parsedResponse.isErr()) {
      console.error("unable to parse segment", parsedResponse.error);

      setSegmentUpdateRequest({
        type: CompletionStatus.Failed,
        error: new Error(JSON.stringify(parsedResponse.error)),
      });
      return;
    }

    upsertSegment(parsedResponse.value);
    setSegmentUpdateRequest({
      type: CompletionStatus.NotStarted,
    });
  };

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
        </MainLayout>
      </main>
    </>
  );
}
