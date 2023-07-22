import {
  Autocomplete,
  Box,
  Button,
  Stack,
  TextField,
  useTheme,
} from "@mui/material";
import { findAllUserTraits } from "backend-lib/src/userEvents";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
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
import { validate } from "uuid";
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

const idOption = {
  id: UserPropertyDefinitionType.Id,
  group: "Identifiers",
  label: "User Id",
};

const anonymousIdOption = {
  id: UserPropertyDefinitionType.Id,
  group: "Identifiers",
  label: "User Anonymous Id",
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

type UserPropertyGroupedOption = GroupedOption<UserPropertyDefinitionType>;

function getUserPropertyOptions(
  isProtected: boolean
): UserPropertyGroupedOption[] {
  const io: UserPropertyGroupedOption = {
    ...idOption,
    disabled: isProtected,
  };
  const ao: UserPropertyGroupedOption = {
    ...anonymousIdOption,
    disabled: isProtected,
  };
  const userPropertyOptions: UserPropertyGroupedOption[] = [
    performedOption,
    traitOption,
    io,
    ao,
  ];
  return userPropertyOptions;
}

function getUserPropertyOption(
  type: UserPropertyDefinitionType,
  isProtected: boolean
): UserPropertyGroupedOption {
  switch (type) {
    case UserPropertyDefinitionType.Id:
      return {
        ...idOption,
        disabled: isProtected,
      };
    case UserPropertyDefinitionType.AnonymousId:
      return {
        ...anonymousIdOption,
        disabled: isProtected,
      };
    case UserPropertyDefinitionType.Trait:
      return traitOption;
    case UserPropertyDefinitionType.Performed:
      return performedOption;
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
    updateUserPropertyDefinition({
      ...definition,
      path: e.target.value,
    });
  };

  const handleEventNameChange: ComponentProps<typeof TextField>["onChange"] = (
    e
  ) => {
    updateUserPropertyDefinition({
      ...definition,
      event: e.target.value,
    });
  };

  return (
    <Stack spacing={1} direction="row">
      <TextField
        label="Event Name"
        value={definition.event}
        onChange={handleEventNameChange}
      />
      <TextField
        label="Value"
        value={definition.path}
        onChange={handlePathChange}
      />
    </Stack>
  );
}

function defaultUserProperty(
  type: UserPropertyDefinitionType
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
        type: UserPropertyDefinitionType.Trait,
        path: "",
      };
    case UserPropertyDefinitionType.Performed:
      return {
        type: UserPropertyDefinitionType.Performed,
        event: "",
        path: "",
      };
  }
}

function UserPropertyDefinitionEditor({
  definition,
  isProtected,
}: {
  isProtected: boolean;
  definition: UserPropertyDefinition;
}) {
  const condition = getUserPropertyOption(definition.type, isProtected);
  const updateUserPropertyDefinition = useAppStore(
    (state) => state.updateUserPropertyDefinition
  );

  const selectUserPropertyType = (
    <Autocomplete
      value={condition}
      disabled={isProtected}
      groupBy={(option) => option.group}
      onChange={(_event: unknown, newValue: UserPropertyGroupedOption) => {
        updateUserPropertyDefinition(defaultUserProperty(newValue.id));
      }}
      disableClearable
      options={getUserPropertyOptions(isProtected)}
      renderInput={(params) => (
        <TextField label="User Property Type" {...params} variant="outlined" />
      )}
    />
  );

  let up: React.ReactElement;
  switch (definition.type) {
    case UserPropertyDefinitionType.Id:
      up = <>Hard coded user property for user id.</>;
      break;
    case UserPropertyDefinitionType.AnonymousId:
      up = <>Hard coded user property for anonymous users.</>;
      break;
    case UserPropertyDefinitionType.Trait:
      up = <TraitUserPropertyDefinitionEditor definition={definition} />;
      break;
    case UserPropertyDefinitionType.Performed:
      up = <PerformedUserPropertyDefinitionEditor definition={definition} />;
      break;
  }
  return (
    <Stack spacing={1} direction="row">
      {selectUserPropertyType}
      {up}
    </Stack>
  );
}

export default function NewUserProperty() {
  // FIXME refactor shallow
  const editedUserProperty = useAppStore((state) => state.editedUserProperty);
  const setName = useAppStore((state) => state.setEditableUserPropertyName);
  const apiBase = useAppStore((state) => state.apiBase);
  // FIXME
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
                onChange={(event) => setName(event.target.value)}
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
