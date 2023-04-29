import { AddCircleOutline, Delete } from "@mui/icons-material";
import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import backendConfig from "backend-lib/src/config";
import { toUserPropertyResource } from "backend-lib/src/userProperties";
import protectedUserProperties from "isomorphic-lib/src/protectedUserProperties";
import {
  CompletionStatus,
  DeleteUserPropertyRequest,
  DeleteUserPropertyResponse,
  UserPropertyResource,
} from "isomorphic-lib/src/types";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { v4 as uuid } from "uuid";

import MainLayout from "../../components/mainLayout";
import { addInitialStateToProps } from "../../lib/addInitialStateToProps";
import apiRequestHandlerFactory from "../../lib/apiRequestHandlerFactory";
import { PropsWithInitialState, useAppStore } from "../../lib/appStore";
import prisma from "../../lib/prisma";
import { AppState } from "../../lib/types";

export const getServerSideProps: GetServerSideProps<
  PropsWithInitialState
> = async () => {
  const workspaceId = backendConfig().defaultWorkspaceId;
  const userPropertyResources: UserPropertyResource[] = (
    await prisma().userProperty.findMany({
      where: { workspaceId },
    })
  ).flatMap((segment) => {
    const result = toUserPropertyResource(segment);
    if (result.isErr()) {
      return [];
    }
    return result.value;
  });
  const userProperties: AppState["userProperties"] = {
    type: CompletionStatus.Successful,
    value: userPropertyResources,
  };
  return {
    props: addInitialStateToProps(
      {},
      {
        userProperties,
      }
    ),
  };
};

function UserPropertyItem({
  userProperty,
}: {
  userProperty: UserPropertyResource;
}) {
  const path = useRouter();
  const setUserPropertyDeleteRequest = useAppStore(
    (store) => store.setUserPropertyDeleteRequest
  );
  const apiBase = useAppStore((store) => store.apiBase);
  const userPropertyDeleteRequest = useAppStore(
    (store) => store.userPropertyDeleteRequest
  );
  const deleteUserProperty = useAppStore((store) => store.deleteUserProperty);

  const setDeleteResponse = (
    _response: DeleteUserPropertyResponse,
    deleteRequest?: DeleteUserPropertyRequest
  ) => {
    if (!deleteRequest) {
      return;
    }
    deleteUserProperty(deleteRequest.id);
  };

  const isProtected = protectedUserProperties.has(userProperty.name);

  const handleDelete = apiRequestHandlerFactory({
    request: userPropertyDeleteRequest,
    setRequest: setUserPropertyDeleteRequest,
    responseSchema: DeleteUserPropertyResponse,
    setResponse: setDeleteResponse,
    onSuccessNotice: `Deleted user property ${userProperty.name}.`,
    onFailureNoticeHandler: () =>
      `API Error: Failed to user property ${userProperty.name}.`,
    requestConfig: {
      method: "DELETE",
      url: `${apiBase}/api/user-properties`,
      data: {
        id: userProperty.id,
      },
      headers: {
        "Content-Type": "application/json",
      },
    },
  });

  return (
    <ListItem
      secondaryAction={
        <IconButton edge="end" onClick={handleDelete} disabled={isProtected}>
          <Delete />
        </IconButton>
      }
    >
      <ListItemButton
        sx={{
          border: 1,
          borderTopLeftRadius: 1,
          borderBottomLeftRadius: 1,
          borderColor: "grey.200",
        }}
        onClick={() => {
          path.push(`/user-properties/${userProperty.id}`);
        }}
      >
        <ListItemText primary={userProperty.name} />
      </ListItemButton>
    </ListItem>
  );
}

function UserPropertyListContents() {
  const path = useRouter();
  const userPropertiesResult = useAppStore((store) => store.userProperties);
  const userProperties =
    userPropertiesResult.type === CompletionStatus.Successful
      ? userPropertiesResult.value
      : [];

  let innerContents;
  if (userProperties.length) {
    innerContents = (
      <List
        sx={{
          width: "100%",
          bgcolor: "background.paper",
          borderRadius: 1,
        }}
      >
        {userProperties.map((userProperty) => (
          <UserPropertyItem userProperty={userProperty} key={userProperty.id} />
        ))}
      </List>
    );
  } else {
    innerContents = null;
  }

  return (
    <Stack
      sx={{
        padding: 1,
        width: "100%",
        maxWidth: "40rem",
      }}
      spacing={2}
    >
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ padding: 1 }} variant="h5">
          User Properties
        </Typography>
        <IconButton
          onClick={() => {
            path.push(`/user-properties/${uuid()}`);
          }}
        >
          <AddCircleOutline />
        </IconButton>
      </Stack>
      {innerContents}
    </Stack>
  );
}
export default function UserPropertyList() {
  return (
    <>
      <Head>
        <title>Dittofeed</title>
        <meta name="description" content="Open Source Customer Engagement" />
      </Head>
      <main>
        <MainLayout>
          <UserPropertyListContents />
        </MainLayout>
      </main>
    </>
  );
}
