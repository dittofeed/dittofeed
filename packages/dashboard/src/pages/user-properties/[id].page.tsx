import { PlusCircleFilled } from "@ant-design/icons";
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
import { findAllUserTraits } from "backend-lib/src/userEvents";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  AnyOfUserPropertyDefinition,
  CompletionStatus,
  GroupUserPropertyDefinition,
  PerformedUserPropertyDefinition,
  TraitUserPropertyDefinition,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import React, { ComponentProps } from "react";
import { pick } from "remeda/dist/commonjs/pick";
import { v4 as uuidv4, validate } from "uuid";
import { shallow } from "zustand/shallow";

import EditableName from "../../components/editableName";
import MainLayout from "../../components/mainLayout";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { useAppStore } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { requestContext } from "../../lib/requestContext";
import {
  GroupedOption,
  PreloadedState,
  PropsWithInitialState,
} from "../../lib/types";

const selectorWidth = "192px";

const idOption = {
  id: UserPropertyDefinitionType.Id,
  group: "Identifiers",
  label: "User Id",
  disabled: true,
};

const anonymousIdOption = {
  id: UserPropertyDefinitionType.Id,
  group: "Identifiers",
  label: "User Anonymous Id",
  disabled: true,
};

const traitOption = {
  id: UserPropertyDefinitionType.Trait,
  group: "Identify Events",
  label: "Trait",
};

const performedOption = {
  id: UserPropertyDefinitionType.Performed,
  group: "Track Events",
  label: "Performed",
};

const anyOfOption = {
  id: UserPropertyDefinitionType.AnyOf,
  group: "Group",
  label: "Any Of",
};

type UserPropertyGroupedOption = GroupedOption<UserPropertyDefinitionType>;

const userPropertyOptions: UserPropertyGroupedOption[] = [
  performedOption,
  traitOption,
  anyOfOption,
  idOption,
  anonymousIdOption,
];

const groupedUserPropertyOptions: UserPropertyGroupedOption[] = [
  performedOption,
  traitOption,
];

function getUserPropertyOption(
  type: UserPropertyDefinitionType
): UserPropertyGroupedOption {
  switch (type) {
    case UserPropertyDefinitionType.Id:
      return {
        ...idOption,
      };
    case UserPropertyDefinitionType.AnonymousId:
      return {
        ...anonymousIdOption,
      };
    case UserPropertyDefinitionType.Trait:
      return traitOption;
    case UserPropertyDefinitionType.Performed:
      return performedOption;
    case UserPropertyDefinitionType.AnyOf:
      return anyOfOption;
    case UserPropertyDefinitionType.Group:
      return anyOfOption;
  }
}

function defaultUserProperty(
  type: UserPropertyDefinitionType,
  id?: string
): UserPropertyDefinition {
  switch (type) {
    case UserPropertyDefinitionType.Id:
      return {
        type: UserPropertyDefinitionType.Id,
      };
    case UserPropertyDefinitionType.AnonymousId:
      return {
        type: UserPropertyDefinitionType.AnonymousId,
      };
    case UserPropertyDefinitionType.Trait:
      return {
        id,
        type: UserPropertyDefinitionType.Trait,
        path: "",
      };
    case UserPropertyDefinitionType.Performed:
      return {
        id,
        type: UserPropertyDefinitionType.Performed,
        event: "",
        path: "",
      };
    case UserPropertyDefinitionType.AnyOf: {
      const childId = id ?? uuidv4();
      return {
        type: UserPropertyDefinitionType.Group,
        nodes: [
          {
            id: "any-of-1",
            type: UserPropertyDefinitionType.AnyOf,
            children: [childId],
          },
          {
            id: childId,
            type: UserPropertyDefinitionType.Trait,
            path: "",
          },
        ],
        entry: "any-of-1",
      };
    }
    case UserPropertyDefinitionType.Group: {
      throw new Error("Not implemented");
    }
  }
}

export const getServerSideProps: GetServerSideProps<PropsWithInitialState> =
  requestContext(async (ctx, dfContext) => {
    const serverInitialState: PreloadedState = {};

    const id = ctx.params?.id;

    if (typeof id !== "string" || !validate(id)) {
      return {
        notFound: true,
      };
    }

    const workspaceId = dfContext.workspace.id;
    const [userProperty, traits] = await Promise.all([
      prisma().userProperty.findUnique({
        where: {
          id,
        },
      }),
      findAllUserTraits({
        workspaceId,
      }),
    ]);

    let userPropertyResource: UserPropertyResource;
    if (userProperty && userProperty.workspaceId === workspaceId) {
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

    serverInitialState.traits = {
      type: CompletionStatus.Successful,
      value: traits,
    };

    return {
      props: addInitialStateToProps({
        serverInitialState,
        props: {},
        dfContext,
      }),
    };
  });

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
    updateUserPropertyDefinition((current) => {
      if (current.type !== UserPropertyDefinitionType.Trait) {
        return current;
      }
      current.path = trait;
      return current;
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
      sx={{ width: selectorWidth }}
      options={traitOptions}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Trait Path"
          disabled={params.disabled}
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

function AnyOfUserPropertyDefinitionEditor({
  groupedUserProperty,
  definition,
}: {
  groupedUserProperty: GroupUserPropertyDefinition;
  definition: AnyOfUserPropertyDefinition;
}) {
  const { updateUserPropertyDefinition } = useAppStore(
    (store) => pick(store, ["updateUserPropertyDefinition"]),
    shallow
  );
  return (
    <>
      <IconButton
        color="primary"
        size="large"
        onClick={() =>
          updateUserPropertyDefinition((current) => {
            if (current.type !== UserPropertyDefinitionType.Group) {
              return current;
            }
            const entry = current.nodes.find((n) => n.id === current.entry);
            if (!entry || entry.type !== UserPropertyDefinitionType.AnyOf) {
              return current;
            }
            const newId = uuidv4();
            const newChild = defaultUserProperty(
              UserPropertyDefinitionType.Trait,
              newId
            );
            if (newChild.type !== UserPropertyDefinitionType.Trait) {
              return current;
            }
            entry.children.push(newId);
            current.nodes.push(newChild);
            return current;
          })
        }
      >
        <PlusCircleFilled />
      </IconButton>
      {groupedUserProperty.nodes
        .filter((n) => n.id && definition.children.includes(n.id))
        .map((n) => {
          const condition = getUserPropertyOption(n.type);
          return (
            <>
              <Autocomplete
                key={n.id}
                value={condition}
                sx={{ width: selectorWidth }}
                getOptionDisabled={(option) => option.disabled === true}
                groupBy={(option) => option.group}
                onChange={(
                  _event: unknown,
                  newValue: UserPropertyGroupedOption
                ) => {
                  updateUserPropertyDefinition((current) => {
                    if (current.type !== UserPropertyDefinitionType.Group) {
                      return current;
                    }
                    current.nodes = current.nodes.map((node) => {
                      if (node.id === n.id) {
                        const newNode = defaultUserProperty(
                          newValue.id,
                          node.id
                        );

                        if (
                          !(
                            newNode.type === UserPropertyDefinitionType.Trait ||
                            newNode.type ===
                              UserPropertyDefinitionType.Performed
                          )
                        ) {
                          return node;
                        }
                        return newNode;
                      }
                      return node;
                    });

                    return current;
                  });
                }}
                disableClearable
                options={groupedUserPropertyOptions}
                renderInput={(params) => (
                  <TextField
                    label="User Property Type"
                    {...params}
                    variant="outlined"
                  />
                )}
              />
              {n.type}
            </>
          );
        })}
    </>
  );
}

function PerformedUserPropertyDefinitionEditor({
  definition,
}: {
  definition: PerformedUserPropertyDefinition;
}) {
  const { updateUserPropertyDefinition } = useAppStore(
    (store) => pick(store, ["updateUserPropertyDefinition"]),
    shallow
  );

  const handlePathChange: ComponentProps<typeof TextField>["onChange"] = (
    e
  ) => {
    updateUserPropertyDefinition((current) => {
      if (current.type !== UserPropertyDefinitionType.Performed) {
        return current;
      }
      current.path = e.target.value;
      return current;
    });
  };

  const handleEventNameChange: ComponentProps<typeof TextField>["onChange"] = (
    e
  ) => {
    updateUserPropertyDefinition((current) => {
      if (current.type !== UserPropertyDefinitionType.Performed) {
        return current;
      }
      current.event = e.target.value;
      return current;
    });
  };

  return (
    <Stack spacing={1} direction="row">
      <TextField
        label="Event Name"
        sx={{ width: selectorWidth }}
        value={definition.event}
        onChange={handleEventNameChange}
      />
      <TextField
        label="Property Path"
        sx={{ width: selectorWidth }}
        value={definition.path}
        onChange={handlePathChange}
      />
    </Stack>
  );
}

function UserPropertyDefinitionEditor({
  definition,
  isProtected,
}: {
  isProtected: boolean;
  definition: UserPropertyDefinition;
}) {
  const condition = getUserPropertyOption(definition.type);
  const updateUserPropertyDefinition = useAppStore(
    (state) => state.updateUserPropertyDefinition
  );

  const selectUserPropertyType = (
    <Autocomplete
      value={condition}
      sx={{ width: selectorWidth }}
      disabled={isProtected}
      getOptionDisabled={(option) => option.disabled === true}
      groupBy={(option) => option.group}
      onChange={(_event: unknown, newValue: UserPropertyGroupedOption) => {
        updateUserPropertyDefinition(() => defaultUserProperty(newValue.id));
      }}
      disableClearable
      options={userPropertyOptions}
      renderInput={(params) => (
        <TextField label="User Property Type" {...params} variant="outlined" />
      )}
    />
  );

  let up: React.ReactElement;
  switch (definition.type) {
    case UserPropertyDefinitionType.Id:
      up = <Typography>Hard coded user property for user id.</Typography>;
      break;
    case UserPropertyDefinitionType.AnonymousId:
      up = (
        <Typography>Hard coded user property for anonymous users.</Typography>
      );
      break;
    case UserPropertyDefinitionType.Trait:
      up = <TraitUserPropertyDefinitionEditor definition={definition} />;
      break;
    case UserPropertyDefinitionType.Performed:
      up = <PerformedUserPropertyDefinitionEditor definition={definition} />;
      break;
    case UserPropertyDefinitionType.Group: {
      const entryNode = definition.nodes.find((n) => n.id === definition.entry);
      if (!entryNode || entryNode.type !== UserPropertyDefinitionType.AnyOf) {
        throw new Error("Entry node not found");
      }
      up = (
        <AnyOfUserPropertyDefinitionEditor
          groupedUserProperty={definition}
          definition={entryNode}
        />
      );
      break;
    }
  }
  return (
    <Stack spacing={1} direction="row" sx={{ alignItems: "center" }}>
      {selectUserPropertyType}
      {up}
    </Stack>
  );
}

export default function NewUserProperty() {
  const {
    editedUserProperty,
    setEditableUserPropertyName,
    apiBase,
    userPropertyUpdateRequest,
    setUserPropertyUpdateRequest,
    upsertUserProperty,
  } = useAppStore(
    (store) =>
      pick(store, [
        "editedUserProperty",
        "setEditableUserPropertyName",
        "apiBase",
        "userPropertyUpdateRequest",
        "setUserPropertyUpdateRequest",
        "upsertUserProperty",
      ]),
    shallow
  );
  const theme = useTheme();

  if (!editedUserProperty) {
    return null;
  }
  const { name } = editedUserProperty;

  const handleSave = apiRequestHandlerFactory({
    request: userPropertyUpdateRequest,
    setRequest: setUserPropertyUpdateRequest,
    responseSchema: UserPropertyResource,
    setResponse: upsertUserProperty,
    onSuccessNotice: `Saved user property ${editedUserProperty.name}`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to save user property ${editedUserProperty.name}`,
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
                onChange={(event) =>
                  setEditableUserPropertyName(event.target.value)
                }
              />
              <Button variant="contained" onClick={handleSave}>
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
                isProtected={isProtected}
                definition={editedUserProperty.definition}
              />
            </Box>
          </Stack>
        </MainLayout>
      </main>
    </>
  );
}
