import {
  Autocomplete,
  Box,
  Button,
  Stack,
  TextField,
  useTheme,
} from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { findAllUserTraits } from "backend-lib/src/userEvents";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";
import { schemaValidate } from "isomorphic-lib/src/resultHandling/schemaValidation";
import {
  CompletionStatus,
  TraitUserPropertyDefinition,
  UserPropertyDefinition,
  UserPropertyDefinitionType,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import React from "react";
import { validate } from "uuid";

import EditableName from "../../../components/editableName";
import MainLayout from "../../../components/mainLayout";
import { addInitialStateToProps } from "../../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../../lib/apiRequestHandlerFactory";
import {
  PreloadedState,
  PropsWithInitialState,
  useAppStore,
} from "../../../lib/appStore";
import prisma from "../../../lib/prisma";

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
      up = <>Hard coded user property for user id.</>;
      break;
    case UserPropertyDefinitionType.AnonymousId:
      up = <>Hard coded user property for anonymous users.</>;
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
